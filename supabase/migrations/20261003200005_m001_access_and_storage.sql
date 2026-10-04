-- Alchemist Detailing — Migration 001, file 5 of 6: privileges, row level security, photo storage
-- Apply in order; see file 1 for the overview and conventions.

-- ---------------------------------------------------------------------
-- Privileges (W-11, F-43). Supabase grants every table and function to the
-- website's roles by default; take that away and grant back only what each
-- role needs. Objects created from file 1 on get no automatic grants, so
-- later migrations must grant explicitly.
--   anon          = a signed-out visitor
--   authenticated = any signed-in login (customer, guest, team member, admin)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
-- (File 1 already turned off automatic grants for everything created after it.)

-- The menu, the service area and the form's choices: readable by everyone.
grant select on public.vehicle_types, public.services, public.bundle_parts, public.service_includes,
                public.addon_rules, public.service_type_prices, public.form_options, public.service_zip_codes
  to anon, authenticated;

-- Admin edits to the menu and settings, limited to the admin by the policies below.
grant insert, update, delete on public.vehicle_types, public.bundle_parts, public.service_includes,
                                public.addon_rules, public.service_type_prices, public.service_zip_codes,
                                public.blocked_days, public.blocked_email_domains
  to authenticated;
grant insert, update on public.services, public.form_options to authenticated;   -- retired, never deleted
grant select, update on public.business_settings to authenticated;
grant select on public.blocked_days, public.blocked_email_domains to authenticated;

-- People. Profiles change only through functions; vehicles are edited directly,
-- limited to these columns (the owner is always the caller).
grant select on public.profiles to authenticated;
grant select on public.vehicles to authenticated;
grant insert (make, model, year, color, vehicle_type, size, modifications) on public.vehicles to authenticated;
grant update (make, model, year, color, vehicle_type, size, modifications) on public.vehicles to authenticated;

-- Bookings: read by staff through the policies below; every write goes
-- through functions. Customers read their own through my_bookings().
grant select on public.appointments, public.appointment_items, public.appointment_events,
                public.appointment_assignments, public.job_requests, public.review_requests
  to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.audit_log to authenticated;

-- Functions for everyone: menu, prices, open times, display settings, email check.
grant execute on function
  public.get_public_settings(),
  public.quote_booking(jsonb),
  public.get_availability(date, int, text),
  public.get_calendar(date, int, int, text),
  public.email_allowed(text)
  to anon, authenticated;

-- Functions for signed-in users. Each one checks the caller's role itself.
grant execute on function
  public.submit_booking(jsonb),
  public.my_bookings(),
  public.update_my_profile(text, text),
  public.delete_my_vehicle(uuid),
  public.confirm_booking(uuid, text),
  public.decline_booking(uuid, text),
  public.ask_for_information(uuid, text),
  public.set_booking_time(uuid, date, int, int, text),
  public.set_booking_lane(uuid, text, text),
  public.start_booking(uuid),
  public.complete_booking(uuid, text),
  public.assign_employee(uuid, uuid),
  public.unassign_employee(uuid, uuid),
  public.decide_job_request(uuid, boolean),
  public.resolve_review(uuid, text),
  public.cancel_booking(uuid, text),
  public.set_extra_cost(uuid, int, text),
  public.set_user_role(uuid, public.user_role),
  public.set_user_active(uuid, boolean),
  public.anonymize_customer(uuid),
  public.anonymize_booking(uuid),
  public.staff_create_booking(jsonb),
  public.open_jobs(int),
  public.request_job(uuid, text),
  public.withdraw_job_request(uuid),
  public.request_review(uuid, text, boolean),
  public.assert_admin()
  to authenticated;

-- Helpers that policies and the vehicles table's checks call as the
-- signed-in user. Never granted to signed-out visitors: no policy they
-- reach calls them (F-43).
grant execute on function
  public.app_role(),
  public.mfa_ok(),
  public.is_admin(),
  public.is_manager(),
  public.is_staff(),
  public.is_clean_text(text)
  to authenticated;

-- Server-side only: owner setup and photo cleanup.
grant execute on function
  public.bootstrap_admin(text),
  public.list_unattached_vehicle_photos(interval)
  to service_role;

-- ---------------------------------------------------------------------
-- Row Level Security (W-12). Every policy that calls a role helper applies
-- to signed-in users only, and calls it once per query (F-47).
-- ---------------------------------------------------------------------
alter table public.business_settings enable row level security;
alter table public.blocked_days enable row level security;
alter table public.service_zip_codes enable row level security;
alter table public.blocked_email_domains enable row level security;
alter table public.vehicle_types enable row level security;
alter table public.services enable row level security;
alter table public.bundle_parts enable row level security;
alter table public.service_includes enable row level security;
alter table public.addon_rules enable row level security;
alter table public.service_type_prices enable row level security;
alter table public.form_options enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_items enable row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_assignments enable row level security;
alter table public.job_requests enable row level security;
alter table public.review_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Menu and form choices: active rows for everyone; the admin sees and edits all.
create policy "Menu: active vehicle types" on public.vehicle_types
  for select to anon using (active);
create policy "Menu: vehicle types for signed-in users" on public.vehicle_types
  for select to authenticated using (active or (select public.is_admin()));
create policy "Admin: add vehicle types" on public.vehicle_types
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit vehicle types" on public.vehicle_types
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove vehicle types" on public.vehicle_types
  for delete to authenticated using ((select public.is_admin()));

create policy "Menu: active services" on public.services
  for select to anon using (active);
create policy "Menu: services for signed-in users" on public.services
  for select to authenticated using (active or (select public.is_admin()));
create policy "Admin: add services" on public.services
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit services" on public.services
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Menu: active form choices" on public.form_options
  for select to anon using (active);
create policy "Menu: form choices for signed-in users" on public.form_options
  for select to authenticated using (active or (select public.is_admin()));
create policy "Admin: add form choices" on public.form_options
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit form choices" on public.form_options
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Menu: bundle parts" on public.bundle_parts
  for select to anon, authenticated using (true);
create policy "Admin: add bundle parts" on public.bundle_parts
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit bundle parts" on public.bundle_parts
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove bundle parts" on public.bundle_parts
  for delete to authenticated using ((select public.is_admin()));

create policy "Menu: included add-ons" on public.service_includes
  for select to anon, authenticated using (true);
create policy "Admin: add included add-ons" on public.service_includes
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit included add-ons" on public.service_includes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove included add-ons" on public.service_includes
  for delete to authenticated using ((select public.is_admin()));

create policy "Menu: add-on rules" on public.addon_rules
  for select to anon, authenticated using (true);
create policy "Admin: add add-on rules" on public.addon_rules
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit add-on rules" on public.addon_rules
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove add-on rules" on public.addon_rules
  for delete to authenticated using ((select public.is_admin()));

create policy "Menu: prices by vehicle type" on public.service_type_prices
  for select to anon, authenticated using (true);
create policy "Admin: add prices by vehicle type" on public.service_type_prices
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit prices by vehicle type" on public.service_type_prices
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove prices by vehicle type" on public.service_type_prices
  for delete to authenticated using ((select public.is_admin()));

create policy "Menu: service area" on public.service_zip_codes
  for select to anon, authenticated using (true);
create policy "Admin: add service area ZIP codes" on public.service_zip_codes
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit service area ZIP codes" on public.service_zip_codes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove service area ZIP codes" on public.service_zip_codes
  for delete to authenticated using ((select public.is_admin()));

-- Settings: managers read them all (the owner's address included); the
-- admin edits. Everyone else gets the display fields from get_public_settings().
create policy "Managers: read settings" on public.business_settings
  for select to authenticated using ((select public.is_manager()));
create policy "Admin: edit settings" on public.business_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Managers: read closed days" on public.blocked_days
  for select to authenticated using ((select public.is_manager()));
create policy "Admin: add closed days" on public.blocked_days
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit closed days" on public.blocked_days
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove closed days" on public.blocked_days
  for delete to authenticated using ((select public.is_admin()));

create policy "Admin: read blocked email domains" on public.blocked_email_domains
  for select to authenticated using ((select public.is_admin()));
create policy "Admin: add blocked email domains" on public.blocked_email_domains
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit blocked email domains" on public.blocked_email_domains
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: remove blocked email domains" on public.blocked_email_domains
  for delete to authenticated using ((select public.is_admin()));

-- Profiles: everyone reads their own; managers read customers and the team.
create policy "Profiles: own, or managers" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_manager()));

-- Saved vehicles: the owner only. Staff work from each booking's own copy.
create policy "Vehicles: read own" on public.vehicles
  for select to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null);
create policy "Vehicles: add own" on public.vehicles
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and deleted_at is null and (select public.app_role()) is not null);
create policy "Vehicles: edit own" on public.vehicles
  for update to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null and (select public.app_role()) is not null)
  with check (owner_id = (select auth.uid()) and deleted_at is null);

-- Bookings: managers see all; other team members see the jobs assigned to
-- them, in full. Customers use my_bookings(), which leaves out the lane and
-- the review reasons (F-50).
create policy "Bookings: managers, or assigned team members" on public.appointments
  for select to authenticated
  using ((select public.is_manager())
      or ((select public.is_staff())
          and id in (select x.appointment_id from public.appointment_assignments x
                     where x.employee_id = (select auth.uid()))));

create policy "Booking lines: managers, or assigned team members" on public.appointment_items
  for select to authenticated
  using ((select public.is_manager())
      or ((select public.is_staff())
          and appointment_id in (select x.appointment_id from public.appointment_assignments x
                                 where x.employee_id = (select auth.uid()))));

create policy "Booking history: managers, or assigned team members" on public.appointment_events
  for select to authenticated
  using ((select public.is_manager())
      or ((select public.is_staff())
          and appointment_id in (select x.appointment_id from public.appointment_assignments x
                                 where x.employee_id = (select auth.uid()))));

create policy "Assignments: managers, or your own" on public.appointment_assignments
  for select to authenticated
  using ((select public.is_manager())
      or (employee_id = (select auth.uid()) and (select public.is_staff())));

create policy "Job requests: managers, or your own" on public.job_requests
  for select to authenticated
  using ((select public.is_manager())
      or (employee_id = (select auth.uid()) and (select public.is_staff())));

-- Review requests addressed to the admin are seen by the admin and the person who asked.
create policy "Review requests: managers, the admin, or your own" on public.review_requests
  for select to authenticated
  using ((select public.is_admin())
      or (not for_admin and (select public.is_manager()))
      or (requested_by = (select auth.uid()) and (select public.is_staff())));

-- Notices: your own; you can mark them read.
create policy "Notices: read own" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Notices: mark own as read" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy "Audit log: admin only" on public.audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Vehicle photos (W-13, Section 13). One private bucket, a folder per login,
-- viewed only through short-lived signed links. 8 MB per file; JPEG, PNG or
-- WebP. Up to 6 per booking, checked by submit_booking.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos', 'vehicle-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']);

-- Upload: customers and guests whose phone is confirmed (staff none in
-- Migration 001), into their own folder, with a random file name, up to 60
-- files per folder (attached or not).
create function public.can_upload_vehicle_photo(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'customer' and p.is_active
                   and p.deleted_at is null and p.phone is not null)
     and public.is_vehicle_photo_name(p_name, auth.uid())
     and (select count(*) from storage.objects o
          where o.bucket_id = 'vehicle-photos'
            and o.name like auth.uid()::text || '/%') < 60
$$;

-- View: the owner; managers, for photos on any booking; the admin, any file
-- (needed to delete one); other team members only on jobs assigned to them (D-11).
create function public.can_view_vehicle_photo(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
       (public.app_role() is not null and split_part(p_name, '/', 1) = auth.uid()::text)
    or public.is_admin()
    or (public.is_manager()
        and exists (select 1 from public.appointments a where a.photo_paths @> array[p_name]))
    or (public.is_staff()
        and exists (select 1
                    from public.appointments a
                    join public.appointment_assignments x on x.appointment_id = a.id
                    where x.employee_id = auth.uid() and a.photo_paths @> array[p_name])))
$$;

-- Delete: the owner, only while the photo isn't attached to a booking
-- (attached photos stay as a record of the car's condition); the admin, any.
create function public.can_delete_vehicle_photo(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
       (public.app_role() is not null
        and split_part(p_name, '/', 1) = auth.uid()::text
        and not exists (select 1 from public.appointments a where a.photo_paths @> array[p_name]))
    or public.is_admin())
$$;

grant execute on function
  public.can_upload_vehicle_photo(text),
  public.can_view_vehicle_photo(text),
  public.can_delete_vehicle_photo(text)
  to authenticated;

create policy "Vehicle photos: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vehicle-photos' and public.can_upload_vehicle_photo(name));

create policy "Vehicle photos: view" on storage.objects
  for select to authenticated
  using (bucket_id = 'vehicle-photos' and public.can_view_vehicle_photo(name));

create policy "Vehicle photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vehicle-photos' and public.can_delete_vehicle_photo(name));

-- No update policy: nobody can overwrite or move a photo.
