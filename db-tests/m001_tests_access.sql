-- W-16 part 1: what each kind of caller can and can't reach.
-- Callers: signed-out visitor, customer, guest, unconfirmed phone, anonymous
-- login, turned-off account, detailer, manager (with and without the
-- authenticator step) and admin.

-- ---------------------------------------------------------------- visitor
reset role;
select tst.logout();
set role anon;
select tst.eq(tst.q('select count(*) from public.services'), '8', 'visitor: reads the menu');
select tst.eq(tst.q('select count(*) from public.vehicle_types'), '10', 'visitor: reads vehicle types');
select tst.eq(tst.q('select count(*) from public.form_options'), '33', 'visitor: reads form choices');
select tst.eq(tst.q('select count(*) from public.bundle_parts'), '4', 'visitor: reads bundle parts');
select tst.eq(tst.q('select count(*) from public.service_type_prices'), '7', 'visitor: reads sealant prices');
select tst.eq(tst.q('select count(*) from public.service_zip_codes'), '18', 'visitor: reads the service area');
select tst.err('select * from public.profiles', '42501', 'visitor: no profiles');
select tst.err('select * from public.vehicles', '42501', 'visitor: no vehicles');
select tst.err('select * from public.appointments', '42501', 'visitor: no bookings');
select tst.err('select * from public.appointment_items', '42501', 'visitor: no booking lines');
select tst.err('select * from public.business_settings', '42501', 'visitor: no settings table');
select tst.err('select * from public.blocked_days', '42501', 'visitor: no closed days');
select tst.err('select * from public.blocked_email_domains', '42501', 'visitor: no email blocklist');
select tst.err('select * from public.notifications', '42501', 'visitor: no notices');
select tst.err('select * from public.audit_log', '42501', 'visitor: no audit log');
select tst.err($q$insert into public.services (code, kind, name, base_price_cents) values ('x_test', 'addon', 'X', 1)$q$, '42501', 'visitor: can''t add services');
select tst.err($q$update public.services set base_price_cents = 1$q$, '42501', 'visitor: can''t change prices');
select tst.eq(tst.q($q$select public.get_public_settings() ->> 'public_phone'$q$), '(945) 361-7551', 'visitor: public settings show the booking number');
select tst.ok(not (public.get_public_settings() ? 'shop_address'), 'visitor: public settings never include the owner''s address');
select tst.ok(not (public.get_public_settings() ? 'max_open_requests_per_customer'), 'visitor: public settings never include the caps');
select tst.eq(tst.q($q$select public.quote_booking('{"location_type":"shop","bundle":"signature_combo"}') ->> 'total_cents'$q$), '9999', 'visitor: gets a quote');
select tst.ok(cardinality(public.get_availability(tst.d(5), 120, 'shop')) > 0, 'visitor: sees open times');
select tst.ok((select count(*) from public.get_calendar(tst.d(0), 14, 120, 'mobile')) = 14, 'visitor: sees the calendar');
select tst.ok(public.email_allowed('someone@gmail.com'), 'visitor: email check accepts gmail');
select tst.ok(not public.email_allowed('someone@mailinator.com'), 'visitor: email check blocks a throwaway service');
select tst.ok(not public.email_allowed('someone@x.mailinator.com'), 'visitor: email check blocks a throwaway service''s subdomain');
select tst.ok(not public.email_allowed('not an email'), 'visitor: email check blocks junk');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600))$q$, '42501', 'visitor: can''t send a booking');
select tst.err('select public.my_bookings()', '42501', 'visitor: no my_bookings');
select tst.err('select public.is_admin()', '42501', 'visitor: role helpers not callable');
select tst.err('select public.open_jobs()', '42501', 'visitor: no open jobs');
select tst.err($q$select public.bootstrap_admin('9455552002')$q$, '42501', 'visitor: no owner setup');
select tst.err($q$select * from public.list_unattached_vehicle_photos()$q$, '42501', 'visitor: no photo cleanup list');
select tst.err($q$select public.slot_is_bookable(current_date, 600, 60, 'shop')$q$, '42501', 'visitor: internal helpers not callable');
select tst.err($q$select public.notify_managers('x', 'x', 'x', null)$q$, '42501', 'visitor: can''t send notices');

-- ---------------------------------------------------------------- customer A
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.eq(tst.q('select count(*) from public.profiles'), '1', 'customer: sees only their own profile');
select tst.eq(tst.q('select role::text from public.profiles'), 'customer', 'customer: reads own role');
select tst.err($q$update public.profiles set role = 'admin'$q$, '42501', 'customer: can''t change role');
select tst.err($q$update public.profiles set phone = '19725550000'$q$, '42501', 'customer: can''t type a phone into the profile');
select tst.err($q$insert into public.profiles (id) values (gen_random_uuid())$q$, '42501', 'customer: can''t create profiles');
select tst.err($q$delete from public.profiles$q$, '42501', 'customer: can''t delete profiles');
select tst.eq((public.update_my_profile('Carla', 'Díaz-Ruiz')).last_name, 'Díaz-Ruiz', 'customer: edits own name');
select tst.err($q$select public.update_my_profile('Gilbodoso1')$q$, 'invalid_input', 'customer: name with a digit refused');
select tst.err($q$select public.update_my_profile('Bitch')$q$, 'invalid_input', 'customer: swear word refused');
select tst.err($q$select public.update_my_profile('Aaaa')$q$, 'invalid_input', 'customer: run of one letter refused');
select tst.err($q$select public.update_my_profile('qwerty')$q$, 'invalid_input', 'customer: keyboard mash refused');
select tst.eq((public.update_my_profile('Carla', 'Diaz')).first_name, 'Carla', 'customer: name restored');

-- Saved vehicles: own only, limited columns.
select tst.ok(tst.q($q$insert into public.vehicles (make, model, year, color, vehicle_type) values ('Tesla', '3', 2022, 'White', 'sedan') returning tst.setv('veh_a', id::text)$q$) not like 'ERROR%', 'customer: saves a vehicle');
select tst.eq(tst.q('select count(*) from public.vehicles'), '1', 'customer: sees own vehicle');
select tst.err($q$insert into public.vehicles (owner_id, make, model, vehicle_type) values ('00000000-0000-4000-8000-0000000000d2', 'Ford', 'F-150', 'truck')$q$, '42501', 'customer: can''t save a vehicle for someone else');
select tst.err($q$update public.vehicles set owner_id = '00000000-0000-4000-8000-0000000000d2'$q$, '42501', 'customer: can''t give a vehicle away');
select tst.err($q$insert into public.vehicles (make, model, vehicle_type, modifications) values ('Ford', 'F-150', 'truck', '{rocket}')$q$, 'invalid_input', 'customer: modifications only from the list');
select tst.err($q$insert into public.vehicles (make, model, vehicle_type) values ('www.spam.com', 'X', 'truck')$q$, '23514', 'customer: links refused in vehicle details');
select tst.err($q$insert into public.vehicles (make, model, vehicle_type) values ('Ford', 'F-150', 'spaceship')$q$, '23503', 'customer: vehicle type from the list');
select tst.eq(tst.q($q$update public.vehicles set color = 'Red' where id = tst.getv('veh_a')::uuid returning color$q$), 'Red', 'customer: edits own vehicle');
select tst.err($q$delete from public.vehicles$q$, '42501', 'customer: no hard delete of vehicles');

-- Bookings and staff data: none directly.
select tst.eq(tst.q('select count(*) from public.appointments'), '0', 'customer: no direct booking reads');
select tst.eq(tst.q('select count(*) from public.appointment_items'), '0', 'customer: no direct booking-line reads');
select tst.eq(tst.q('select count(*) from public.appointment_events'), '0', 'customer: no direct history reads');
select tst.eq(tst.q('select count(*) from public.business_settings'), '0', 'customer: settings table hidden');
select tst.eq(tst.q('select count(*) from public.blocked_days'), '0', 'customer: closed days hidden');
select tst.eq(tst.q('select count(*) from public.audit_log'), '0', 'customer: audit log hidden');
select tst.eq(tst.q('select count(*) from public.appointment_assignments'), '0', 'customer: assignments hidden');
select tst.err($q$insert into public.appointments (ref, location_type, service_date, start_min, duration_min, value_cents, contact_first, contact_phone, vehicle_not_sure, vehicle_description) values ('AD-AAAAAAAA', 'shop', current_date, 600, 60, 0, 'X', '19725552011', true, 'x')$q$, '42501', 'customer: can''t write bookings directly');
select tst.eq(tst.q($q$with u as (update public.business_settings set max_shop_jobs = 99 returning 1) select count(*) from u$q$), '0', 'customer: settings update touches nothing');
select tst.eq(tst.q($q$with u as (update public.services set base_price_cents = 1 returning 1) select count(*) from u$q$), '0', 'customer: price change touches nothing');
select tst.err($q$insert into public.blocked_days (day) values (current_date + 3)$q$, '42501', 'customer: can''t close days');
select tst.err($q$select public.confirm_booking(gen_random_uuid())$q$, 'not_allowed', 'customer: can''t confirm');
select tst.err($q$select public.cancel_booking(gen_random_uuid())$q$, 'not_allowed', 'customer: can''t cancel');
select tst.err($q$select public.set_extra_cost(gen_random_uuid(), 100)$q$, 'not_allowed', 'customer: can''t set prices');
select tst.err($q$select public.set_user_role('00000000-0000-4000-8000-0000000000d1', 'admin')$q$, 'not_allowed', 'customer: can''t promote themselves');
select tst.err($q$select * from public.open_jobs()$q$, 'not_allowed', 'customer: no open jobs');
select tst.err($q$select public.request_job(gen_random_uuid())$q$, 'not_allowed', 'customer: can''t request jobs');
select tst.err($q$select public.bootstrap_admin('9725552011')$q$, '42501', 'customer: no owner setup');
select tst.err($q$select public.lock_day(current_date)$q$, '42501', 'customer: internal helpers not callable');
select tst.ok(not public.is_admin() and not public.is_manager() and not public.is_staff(), 'customer: role helpers say customer');

-- ---------------------------------------------------------------- manager without the authenticator step
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
set role authenticated;
select tst.err($q$select public.confirm_booking(gen_random_uuid())$q$, 'mfa_required', 'manager without code: asked for the authenticator code');
select tst.eq(tst.q('select count(*) from public.profiles'), '1', 'manager without code: sees only own profile');
select tst.ok(public.is_staff() and not public.is_manager(), 'manager without code: staff, not manager');

-- ---------------------------------------------------------------- manager
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.ok(public.is_manager() and not public.is_admin(), 'manager: manager, not admin');
select tst.eq(tst.q('select count(*) from public.profiles'), '15', 'manager: reads customers and team');
select tst.eq(tst.q('select count(*) from public.business_settings'), '1', 'manager: reads settings');
select tst.eq(tst.q('select count(*) from public.vehicles'), '0', 'manager: saved vehicles stay private');
select tst.eq(tst.q('select count(*) from public.audit_log'), '0', 'manager: audit log is admin only');
select tst.eq(tst.q($q$with u as (update public.business_settings set max_shop_jobs = 99 returning 1) select count(*) from u$q$), '0', 'manager: can''t change settings');
select tst.err($q$select public.set_user_role('00000000-0000-4000-8000-0000000000c1', 'manager')$q$, 'not_allowed', 'manager: can''t change roles');
select tst.err($q$select public.cancel_booking(gen_random_uuid())$q$, 'not_allowed', 'manager: can''t cancel (admin only)');
select tst.err($q$select public.set_extra_cost(gen_random_uuid(), 100)$q$, 'not_allowed', 'manager: can''t set the extra cost (admin only)');
select tst.err($q$select public.anonymize_customer('00000000-0000-4000-8000-0000000000d1')$q$, 'not_allowed', 'manager: can''t remove customers');

-- ---------------------------------------------------------------- detailer
reset role;
select tst.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
set role authenticated;
select tst.ok(public.is_staff() and not public.is_manager(), 'detailer: staff only');
select tst.eq(tst.q('select count(*) from public.profiles'), '1', 'detailer: sees only own profile');
select tst.err($q$select public.confirm_booking(gen_random_uuid())$q$, 'not_allowed', 'detailer: can''t confirm');
select tst.err($q$select public.assign_employee(gen_random_uuid(), '00000000-0000-4000-8000-0000000000c1')$q$, 'not_allowed', 'detailer: can''t assign themselves');
select tst.eq(tst.q('select count(*) from public.open_jobs()'), '0', 'detailer: open jobs list works (empty)');

-- ---------------------------------------------------------------- admin
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal1');
set role authenticated;
select tst.err($q$select public.set_user_role('00000000-0000-4000-8000-0000000000c1', 'manager')$q$, 'mfa_required', 'admin without code: asked for the authenticator code');
select tst.eq(tst.q($q$with u as (update public.services set base_price_cents = 1 returning 1) select count(*) from u$q$), '0', 'admin without code: no price changes');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.ok(public.is_admin() and public.is_manager(), 'admin: admin and manager');
select tst.ok(tst.q('select count(*) from public.audit_log')::int > 0, 'admin: reads the audit log');
select tst.ok(tst.q($q$select string_agg(coalesce(old_value::text, '') || coalesce(new_value::text, ''), '') from public.audit_log where target_type = 'profiles'$q$) !~ '1972555|carla|Carla', 'admin: audit log keeps no names, phones or emails');
select tst.err($q$select public.set_user_role('00000000-0000-4000-8000-0000000000a1', 'customer')$q$, 'wrong_state', 'admin: the last admin can''t be demoted');
select tst.err($q$select public.set_user_active('00000000-0000-4000-8000-0000000000a1', false)$q$, 'wrong_state', 'admin: can''t turn off own account');
select tst.eq(tst.q($q$with u as (update public.services set description = description returning 1) select count(*) from u$q$), '8', 'admin: edits the menu');
select tst.eq(tst.q($q$insert into public.blocked_days (day, reason) values (tst.d(40), 'Holiday') returning day::text$q$), tst.d(40)::text, 'admin: closes a day');
select tst.ok(tst.q($q$select count(*) from public.blocked_email_domains$q$) not like 'ERROR%', 'admin: reads the email blocklist');
select tst.err($q$delete from public.services where code = 'ext_basic'$q$, '42501', 'admin: services are retired, never deleted');
select tst.err($q$update public.business_settings set timezone = 'Mars/Olympus'$q$, 'invalid_input', 'admin: time zone must be real');
select tst.err($q$update public.business_settings set first_start_min = 615$q$, '23514', 'admin: hours must sit on the 30-minute grid');

-- ---------------------------------------------------------------- turned-off account
reset role;
select tst.login('00000000-0000-4000-8000-0000000000e3');
set role authenticated;
select tst.err('select public.my_bookings()', 'not_allowed', 'turned-off account: blocked');
reset role;
