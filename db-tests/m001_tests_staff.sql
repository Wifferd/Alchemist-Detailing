-- W-16 part 3: staff actions, assignments, job and review requests, extra
-- cost, cancelling, notices, photos for staff, removing a customer.
-- Runs after m001_tests_booking.sql (uses its bookings).
-- Team: admin a1, manager b1, detailers c1 (Dana) and c2 (Drew).

reset role;
-- More room per customer for this part (the caps were tested already).
update public.business_settings set max_open_requests_per_customer = 30, max_requests_per_customer_per_day = 60 where id = 1;
select tst.setv('n_all', (select count(*) from public.appointments)::text);

-- ---------------------------------------------------------------- admin stores the private address
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.eq(tst.q($q$update public.business_settings set shop_address = '4321 Example Lane, Parker, TX 75002' returning shop_address$q$),
              '4321 Example Lane, Parker, TX 75002', 'admin: stores the private address');

-- ---------------------------------------------------------------- manager: confirm, decline, ask, time, lanes
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.eq(tst.q('select count(*) from public.appointments'), tst.getv('n_all'), 'manager: sees every booking, Spam included');
select tst.err(format('select public.confirm_booking(%L)', tst.getv('c_xl')::jsonb ->> 'id'), 'wrong_state', 'confirm: refused while the price waits for the extra cost');
select tst.eq((public.confirm_booking((select id from public.appointments where id = tst.getv('b1')::uuid), 'See you Saturday!')).status::text, 'confirmed', 'confirm: manager confirms a request');
select tst.ok((select hold_expires_at is null from public.appointments where id = tst.getv('b1')::uuid), 'confirm: the hold becomes permanent');
select tst.eq((public.confirm_booking((tst.getv('a1')::jsonb ->> 'id')::uuid)).status::text, 'confirmed', 'confirm: a lapsed request whose time is still free can be confirmed');
select tst.err(format('select public.confirm_booking(%L)', tst.getv('a2')::jsonb ->> 'id'), 'slot_unavailable', 'confirm: a lapsed request whose time was taken is refused');
select tst.eq((public.decline_booking((tst.getv('a2')::jsonb ->> 'id')::uuid, 'Sorry, that time was taken. Please pick another.')).status::text, 'declined', 'decline: manager declines');
select tst.err(format('select public.decline_booking(%L)', tst.getv('b1')), 'wrong_state', 'decline: a confirmed booking can''t be declined (admin cancels)');
select tst.err(format('select public.ask_for_information(%L, %L)', tst.getv('d1')::jsonb ->> 'id', ''), 'invalid_input', 'ask: a note is required');
select tst.eq((public.ask_for_information((tst.getv('d1')::jsonb ->> 'id')::uuid, 'Which van is it? Please call us.')).status::text, 'needs_information', 'ask: request marked as needing information');
select tst.err(format('select public.set_booking_time(%L, %L, 600)', tst.getv('d1')::jsonb ->> 'id', tst.d(3)), 'slot_unavailable', 'set time: refused when the new time is taken');
select tst.err(format('select public.set_booking_time(%L, %L, 615)', tst.getv('d1')::jsonb ->> 'id', tst.d(5)), 'slot_unavailable', 'set time: off-grid time refused');
select tst.eq((public.set_booking_time((tst.getv('d1')::jsonb ->> 'id')::uuid, tst.d(5), 660, null, 'Moved to 11:00 as discussed.')).start_min::text, '660', 'set time: moved to a free time');
select tst.err(format('select public.set_booking_time(%L, %L, 600, 4)', tst.getv('d1')::jsonb ->> 'id', tst.d(5)), 'invalid_input', 'set time: length must be at least 5 minutes');
select tst.eq((public.set_booking_lane((tst.getv('d3')::jsonb ->> 'id')::uuid, 'requests')).queue::text, 'requests', 'lanes: Review to Requests');
select tst.ok((public.set_booking_lane((tst.getv('d2')::jsonb ->> 'id')::uuid, 'spam')).hold_expires_at is null, 'lanes: into Spam stops holding time');
select tst.err(format('select public.set_booking_lane(%L, %L)', tst.getv('b3')::jsonb ->> 'id', 'requests'), 'slot_unavailable', 'lanes: out of Spam refused when its time was taken');
select tst.ok((public.set_booking_lane((tst.getv('d2')::jsonb ->> 'id')::uuid, 'review')).hold_expires_at > now(), 'lanes: out of Spam holds time again');
select tst.ok((select 'staff' = any (review_reasons) from public.appointments where id = (tst.getv('d2')::jsonb ->> 'id')::uuid), 'lanes: a manual move to Review is marked');
select tst.err(format('select public.set_booking_lane(%L, %L)', tst.getv('b1'), 'spam'), 'wrong_state', 'lanes: only undecided requests change lanes');
select tst.eq((public.start_booking(tst.getv('b1')::uuid)).status::text, 'in_progress', 'start: confirmed job started');
select tst.eq((public.complete_booking(tst.getv('b1')::uuid)).status::text, 'completed', 'complete: job completed');
select tst.err(format('select public.complete_booking(%L)', tst.getv('b1')), 'wrong_state', 'complete: only once');

-- Customers see what changed, with the notes, but never the lanes.
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d5');
set role authenticated;
select tst.ok((select count(*) = 2 from public.notifications where kind in ('status_needs_information', 'time_changed')), 'notices: customer told about the question and the new time');
select tst.ok(exists (select 1 from public.notifications where kind = 'time_changed' and body like 'Moved to 11:00 as discussed.%11:00 AM%'), 'notices: new time shown with the note');
select tst.ok((select bool_and(b::text !~* 'spam|review') from public.my_bookings() b), 'my_bookings: lane moves never shown to the customer');
select tst.ok((select (b -> 'history') @> '[{"status":"needs_information","note":"Which van is it? Please call us."}]'
               from public.my_bookings() b where b ->> 'id' = tst.getv('d1')::jsonb ->> 'id'), 'my_bookings: history shows status changes with notes');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.ok((select (b ->> 'shop_address') = '4321 Example Lane, Parker, TX 75002'
               from public.my_bookings() b where b ->> 'id' = tst.getv('a1')::jsonb ->> 'id'), 'address: shown on the customer''s own confirmed driveway booking');
select tst.ok((select bool_and(b ->> 'shop_address' is null) from public.my_bookings() b where b ->> 'status' <> 'confirmed'), 'address: hidden on other bookings');
select tst.ok(exists (select 1 from public.notifications where kind = 'status_declined' and body like 'Sorry, that time was taken.%'), 'notices: decline note reaches the customer');
select tst.err($q$update public.notifications set title = 'x'$q$, '42501', 'notices: customers can only mark them read');
select tst.ok(tst.q($q$with u as (update public.notifications set read_at = now() returning 1) select count(*) from u$q$)::int > 0, 'notices: customer marks own notices read');
select tst.ok(tst.q($q$select count(*) from public.notifications where recipient_id <> '00000000-0000-4000-8000-0000000000d1'$q$) = '0', 'notices: only own notices visible');

-- ---------------------------------------------------------------- extra cost and cancelling (admin)
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.err(format('select public.set_extra_cost(%L, -5)', tst.getv('c_xl')::jsonb ->> 'id'), 'invalid_input', 'extra cost: no negative amounts');
select tst.eq((public.set_extra_cost((tst.getv('c_xl')::jsonb ->> 'id')::uuid, 1500, 'XL truck: +$15.00')).total_cents::text, '11499', 'extra cost: total released with the extra cost');
reset role;
select tst.ok(exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000d4' and kind = 'price_set' and body like 'Total: $114.99.%'), 'extra cost: customer told the new total at once');
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.eq((public.confirm_booking((tst.getv('c_xl')::jsonb ->> 'id')::uuid)).status::text, 'confirmed', 'extra cost: booking can be confirmed once priced');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.eq((public.set_extra_cost((tst.getv('c_xl')::jsonb ->> 'id')::uuid, 2000, 'XL truck: +$20.00')).total_cents::text, '11999', 'extra cost: can be changed');
select tst.eq((public.cancel_booking((tst.getv('c_xl')::jsonb ->> 'id')::uuid, 'Cancelled at your request.')).status::text, 'cancelled', 'cancel: admin cancels a confirmed booking');
select tst.err(format('select public.set_extra_cost(%L, 100)', tst.getv('c_xl')::jsonb ->> 'id'), 'wrong_state', 'extra cost: not on a closed booking');
select tst.err(format('select public.cancel_booking(%L)', tst.getv('c_xl')::jsonb ->> 'id'), 'wrong_state', 'cancel: only once');
reset role;
select tst.ok((select count(*) = 2 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000d4' and kind = 'price_set'), 'extra cost: customer told each time it changes');

-- ---------------------------------------------------------------- assignments and each person's limits
select tst.login('00000000-0000-4000-8000-0000000000d3');
set role authenticated;
select tst.setv('s1', public.submit_booking(tst.booking('shop', tst.d(20), 600)) ->> 'id');
select tst.setv('s4', public.submit_booking(tst.booking('shop', tst.d(22), 600)) ->> 'id');
select tst.setv('s7', public.submit_booking(tst.booking('shop', tst.d(23), 600)) ->> 'id');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d2');
set role authenticated;
select tst.setv('s2', public.submit_booking(tst.booking('shop', tst.d(20), 600, '{"vehicle_make":"Mazda","vehicle_model":"6"}')) ->> 'id');
select tst.setv('s3', public.submit_booking(tst.booking('mobile', tst.d(21), 600)) ->> 'id');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select public.confirm_booking(tst.getv(k)::uuid) from unnest(array['s1', 's2', 's3', 's4', 's7']) as k;
select tst.err(format('select public.assign_employee(%L, %L)', tst.getv('d3')::jsonb ->> 'id', '00000000-0000-4000-8000-0000000000c1'), 'wrong_state', 'assign: only confirmed jobs');
select tst.err(format('select public.assign_employee(%L, %L)', tst.getv('s1'), '00000000-0000-4000-8000-0000000000d1'), 'not_found', 'assign: only team members');
select public.assign_employee(tst.getv('s1')::uuid, '00000000-0000-4000-8000-0000000000c1');
select public.assign_employee(tst.getv('s2')::uuid, '00000000-0000-4000-8000-0000000000c1');
select tst.ok(true, 'assign: one person can take 2 driveway cars at once');
select public.assign_employee(tst.getv('s1')::uuid, '00000000-0000-4000-8000-0000000000c1');
select tst.eq((select count(*)::text from public.appointment_assignments where appointment_id = tst.getv('s1')::uuid), '1', 'assign: assigning twice changes nothing');
select public.assign_employee(tst.getv('s1')::uuid, '00000000-0000-4000-8000-0000000000c2');
select tst.eq((select count(*)::text from public.appointment_assignments where appointment_id = tst.getv('s1')::uuid), '2', 'assign: several people can work one car');
select public.assign_employee(tst.getv('s3')::uuid, '00000000-0000-4000-8000-0000000000c1');

-- Allow both kinds at once and 2 mobile jobs, to test each person's own limits.
reset role;
update public.business_settings set shop_and_mobile_together = true, max_mobile_jobs = 2 where id = 1;
select tst.login('00000000-0000-4000-8000-0000000000d6');
set role authenticated;
select tst.setv('s5', public.submit_booking(tst.booking('mobile', tst.d(20), 630)) ->> 'id');
select tst.setv('s6', public.submit_booking(tst.booking('mobile', tst.d(20), 660, '{"vehicle_make":"Kia","vehicle_model":"Soul"}')) ->> 'id');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select public.confirm_booking(tst.getv('s5')::uuid);
select public.confirm_booking(tst.getv('s6')::uuid);
select tst.err(format('select public.assign_employee(%L, %L)', tst.getv('s5'), '00000000-0000-4000-8000-0000000000c1'), 'slot_unavailable', 'person limit: never a driveway car and a mobile job at once');
select tst.ok(tst.q(format('select public.assign_employee(%L, %L)', tst.getv('s5'), '00000000-0000-4000-8000-0000000000b1')) not like 'ERROR%', 'person limit: a free manager can take the mobile job');
select tst.err(format('select public.assign_employee(%L, %L)', tst.getv('s6'), '00000000-0000-4000-8000-0000000000b1'), 'slot_unavailable', 'person limit: one mobile job at a time');
select tst.err(format('select public.set_booking_time(%L, %L, 630)', tst.getv('s1'), tst.d(21)), 'slot_unavailable', 'set time: refused when an assigned person would be double-booked');
select tst.ok((select detail like '%Dana already has a job at that time.%' from tst.results where label = 'set time: refused when an assigned person would be double-booked' order by id desc limit 1), 'set time: names the busy person');
reset role;
update public.business_settings set shop_and_mobile_together = false, max_mobile_jobs = 1 where id = 1;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select public.unassign_employee(tst.getv('s1')::uuid, '00000000-0000-4000-8000-0000000000c2');
select tst.err(format('select public.unassign_employee(%L, %L)', tst.getv('s1'), '00000000-0000-4000-8000-0000000000c2'), 'not_found', 'unassign: only someone assigned');
reset role;
select tst.ok(exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000c2' and kind = 'unassigned'), 'notices: person told when removed from a job');
select tst.ok((select count(*) >= 3 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000c1' and kind = 'assigned'), 'notices: person told about each new job');

-- ---------------------------------------------------------------- what a detailer sees
select tst.setv('open_refs', (select string_agg(a.ref, ',' order by a.service_date, a.start_min) from public.appointments a
                              where a.status = 'confirmed' and a.service_date >= public.local_today()
                                and not exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id)));
select tst.ok(tst.getv('open_refs') like '%' || (select ref from public.appointments where id = tst.getv('s4')::uuid) || '%', 'open jobs: setup has an open job');
select tst.login('00000000-0000-4000-8000-0000000000c1');
set role authenticated;
select tst.eq(tst.q('select count(*) from public.appointments'), '3', 'detailer: sees only the jobs assigned to them');
select tst.ok(tst.q($q$select count(*) from public.appointments where contact_phone is not null$q$) = '3', 'detailer: assigned jobs in full, contact details included');
select tst.eq(tst.q($q$select count(distinct appointment_id) from public.appointment_items$q$), '3', 'detailer: lines of assigned jobs only');
select tst.eq(tst.q($q$select count(*) from public.appointment_assignments$q$), '3', 'detailer: own assignments only');
select tst.eq(tst.q($q$select count(*) from public.profiles$q$), '1', 'detailer: no customer profiles');
select tst.eq(tst.q($q$select string_agg(ref, ',' order by service_date, start_min) from public.open_jobs(60)$q$),
              tst.getv('open_refs'), 'open jobs: confirmed jobs with nobody assigned');
select tst.eq(tst.q($q$select area || ' / ' || vehicle from public.open_jobs(60) limit 1$q$), 'Driveway / 2019 Honda Civic (Blue)', 'open jobs: area and vehicle, no contact details');
select tst.setv('jr1', public.request_job(tst.getv('s4')::uuid, 'I can take this one.')::text);
select tst.err(format('select public.request_job(%L)', tst.getv('s4')), 'wrong_state', 'job request: one open request per job');
select tst.err(format('select public.request_job(%L)', tst.getv('s1')), 'wrong_state', 'job request: only open jobs');
select tst.ok((select requested_by_me from public.open_jobs(60) where id = tst.getv('s4')::uuid), 'open jobs: shows the person''s own request');
select tst.setv('rv1', public.request_review(tst.getv('s1')::uuid, 'Customer mentioned heavy pet hair.')::text);
select tst.setv('rv2', public.request_review(tst.getv('s2')::uuid, 'Please check the paint before we start.', true)::text);
select tst.err(format('select public.request_review(%L, %L)', tst.getv('a3')::jsonb ->> 'id', 'x'), 'not_found', 'review request: not on bookings the person can''t see');
select tst.err(format('select public.request_review(%L, %L)', tst.getv('s1'), ''), 'invalid_input', 'review request: needs a message');
select tst.eq(tst.q('select count(*) from public.review_requests'), '2', 'review request: the person sees their own');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000c2');
set role authenticated;
select tst.setv('jr2', public.request_job(tst.getv('s4')::uuid)::text);
select tst.setv('jr3', public.request_job(tst.getv('s7')::uuid)::text);
select public.withdraw_job_request(tst.getv('jr3')::uuid);
select tst.err(format('select public.withdraw_job_request(%L)', tst.getv('jr3')), 'not_found', 'job request: withdrawn once');
select tst.err(format('select public.withdraw_job_request(%L)', tst.getv('jr1')), 'not_found', 'job request: can''t withdraw someone else''s');
select tst.eq(tst.q('select count(*) from public.job_requests'), '2', 'job request: the person sees their own');
select tst.eq(tst.q('select count(*) from public.review_requests'), '0', 'review request: others'' requests hidden');

-- ---------------------------------------------------------------- managers decide
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.eq(tst.q('select count(*) from public.review_requests'), '1', 'review request: a request for the admin is hidden from managers');
select tst.err(format('select public.resolve_review(%L, %L)', tst.getv('rv2'), 'ok'), 'not_allowed', 'review request: managers can''t answer the admin''s');
select public.resolve_review(tst.getv('rv1')::uuid, 'Bring the pet-hair kit.');
select public.decide_job_request(tst.getv('jr1')::uuid, true);
select tst.ok((select status = 'approved' from public.job_requests where id = tst.getv('jr1')::uuid)
          and exists (select 1 from public.appointment_assignments where appointment_id = tst.getv('s4')::uuid and employee_id = '00000000-0000-4000-8000-0000000000c1'), 'job request: approving assigns the person');
select public.decide_job_request(tst.getv('jr2')::uuid, false);
select tst.err(format('select public.decide_job_request(%L, true)', tst.getv('jr2')), 'wrong_state', 'job request: decided once');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.eq(tst.q('select count(*) from public.review_requests'), '2', 'review request: the admin sees all');
select public.resolve_review(tst.getv('rv2')::uuid, 'Checked. Go ahead.');
reset role;
select tst.ok(exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000c1' and kind = 'job_request_approved'), 'notices: job request approval');
select tst.ok(exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000c2' and kind = 'job_request_declined'), 'notices: job request declined');
select tst.ok((select count(*) = 2 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000c1' and kind = 'review_resolved'), 'notices: review answers reach the person who asked');
select tst.ok((select count(*) = 1 from public.notifications n where n.kind = 'review_request' and n.title = 'Admin review requested'), 'notices: admin reviews go to the admin only');

-- ---------------------------------------------------------------- photos and staff
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select public.confirm_booking((tst.getv('e2')::jsonb ->> 'id')::uuid);
select public.assign_employee((tst.getv('e2')::jsonb ->> 'id')::uuid, '00000000-0000-4000-8000-0000000000c2');
select tst.eq(tst.q($q$select count(*) from storage.objects where bucket_id = 'vehicle-photos'$q$), '1', 'photos: managers see photos on bookings');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d6');
set role authenticated;
select tst.q($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000d6/2a2b3c4d-1111-4222-8333-444455559999.webp') returning name$q$);
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.eq(tst.q($q$select count(*) from storage.objects where bucket_id = 'vehicle-photos'$q$), '1', 'photos: managers don''t see unattached uploads');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000c2');
set role authenticated;
select tst.eq(tst.q($q$select count(*) from storage.objects where bucket_id = 'vehicle-photos'$q$), '1', 'photos: the assigned detailer sees the job''s photos');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000c1');
set role authenticated;
select tst.eq(tst.q($q$select count(*) from storage.objects where bucket_id = 'vehicle-photos'$q$), '0', 'photos: other detailers don''t');
reset role;
update storage.objects set created_at = now() - interval '2 days' where name like '%444455559999.webp';
set role service_role;
select tst.eq(tst.q($q$select string_agg(name, ',') from public.list_unattached_vehicle_photos()$q$), '00000000-0000-4000-8000-0000000000d6/2a2b3c4d-1111-4222-8333-444455559999.webp', 'cleanup: lists only old unattached photos');
reset role;
select set_config('storage.allow_delete_query', 'true', false);   -- stands in for a Storage API delete
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.eq(tst.q($q$with d as (delete from storage.objects where name like '%444455559999.webp' returning 1) select count(*) from d$q$), '1', 'photos: the admin can delete any photo');

-- ---------------------------------------------------------------- turned-off staff
select public.set_user_active('00000000-0000-4000-8000-0000000000c2', false);
reset role;
select tst.login('00000000-0000-4000-8000-0000000000c2');
set role authenticated;
select tst.err('select * from public.open_jobs()', 'not_allowed', 'turned off: detailer loses access at once');
select tst.eq(tst.q('select count(*) from public.appointments'), '0', 'turned off: no bookings visible');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select public.set_user_active('00000000-0000-4000-8000-0000000000c2', true);

-- ---------------------------------------------------------------- removing a customer (D-12)
select tst.err($q$select public.anonymize_customer('00000000-0000-4000-8000-0000000000d5')$q$, 'wrong_state', 'remove customer: refused while bookings are open');
select tst.err($q$select public.anonymize_customer('00000000-0000-4000-8000-0000000000c1')$q$, 'wrong_state', 'remove customer: team accounts are turned off instead');
select public.decline_booking(id, null) from public.appointments
 where customer_id = '00000000-0000-4000-8000-0000000000d5' and status in ('requested', 'needs_information');
select public.anonymize_customer('00000000-0000-4000-8000-0000000000d5');
reset role;
select tst.ok((select first_name is null and phone is null and email is null and not is_active and deleted_at is not null
               from public.profiles where id = '00000000-0000-4000-8000-0000000000d5'), 'remove customer: profile details cleared');
select tst.ok((select bool_and(contact_first is null and contact_phone is null and address is null and anonymized_at is not null
                               and value_cents > 0 and service_date is not null)
               from public.appointments where customer_id = '00000000-0000-4000-8000-0000000000d5'), 'remove customer: bookings kept without personal details');
select tst.ok(not exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000d5'), 'remove customer: notices removed');
select tst.ok(not exists (select 1 from public.appointment_events e join public.appointments a on a.id = e.appointment_id
                          where a.customer_id = '00000000-0000-4000-8000-0000000000d5' and e.note is not null), 'remove customer: staff notes on their bookings cleared');
select tst.ok(not exists (select 1 from public.audit_log where coalesce(old_value::text, '') || coalesce(new_value::text, '') ~ '12145552022|Eli|Main St|Which van'), 'audit: no personal details kept in the log');
select tst.ok((select count(*) = 0 from public.audit_log where target_type = 'appointments' and (new_value ? 'contact_phone' or new_value ? 'address')), 'audit: contact fields left out of booking changes');
