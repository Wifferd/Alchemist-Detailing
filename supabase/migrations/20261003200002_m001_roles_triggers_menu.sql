-- Alchemist Detailing — Migration 001, file 2 of 6: roles, triggers, notices, today's menu
-- Apply in order; see file 1 for the overview and conventions.

-- ---------------------------------------------------------------------
-- Who is calling. Roles always come from the profiles table, never from the
-- login token or sign-up data. Managers and the admin also need the second
-- sign-in step (an authenticator-app code, "aal2"), decided Oct 3.
-- ---------------------------------------------------------------------
create function public.app_role() returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active and p.deleted_at is null
$$;

create function public.mfa_ok() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not coalesce((select s.require_mfa_for_managers from public.business_settings s where s.id = 1), true)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false) and public.mfa_ok()
$$;

create function public.is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() in ('manager', 'admin'), false) and public.mfa_ok()
$$;
comment on function public.is_manager() is 'True for managers and the admin, after their authenticator code.';

create function public.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() in ('detailer', 'manager', 'admin'), false)
$$;

create function public.is_assigned(p_appointment uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_staff()
     and exists (
       select 1 from public.appointment_assignments a
       where a.appointment_id = p_appointment and a.employee_id = auth.uid())
$$;

create function public.assert_signed_in() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform public.fail('sign_in_required', 'Please sign in first.');
  end if;
  if public.app_role() is null then
    perform public.fail('not_allowed', 'This account can''t do that.');
  end if;
end
$$;

create function public.assert_staff() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_signed_in();
  if not public.is_staff() then
    perform public.fail('not_allowed', 'This is for team members only.');
  end if;
end
$$;

create function public.assert_manager() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_signed_in();
  if public.app_role() in ('manager', 'admin') and not public.mfa_ok() then
    perform public.fail('mfa_required', 'Enter the code from your authenticator app to continue.');
  end if;
  if not public.is_manager() then
    perform public.fail('not_allowed', 'Only a manager or the admin can do this.');
  end if;
end
$$;

create function public.assert_admin() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_signed_in();
  if public.app_role() = 'admin' and not public.mfa_ok() then
    perform public.fail('mfa_required', 'Enter the code from your authenticator app to continue.');
  end if;
  if not public.is_admin() then
    perform public.fail('not_allowed', 'Only the admin can do this.');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger business_settings_touch before update on public.business_settings
  for each row execute function public.touch_updated_at();
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();
create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- The settings' time zone must be a real one, or availability would break (F-59).
create function public.check_business_settings() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    perform public.fail('invalid_input', 'That time zone doesn''t exist.', 'timezone');
  end if;
  return new;
end
$$;
create trigger business_settings_check before insert or update on public.business_settings
  for each row execute function public.check_business_settings();

-- Catalog links must make sense: bundles are made of exterior and interior
-- services, services include add-ons, and only typed add-ons get typed prices.
create function public.check_catalog_links() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  k1 public.service_kind;
  k2 public.service_kind;
  typed boolean;
begin
  if tg_table_name = 'bundle_parts' then
    select s.kind into k1 from public.services s where s.id = new.bundle_id;
    select s.kind into k2 from public.services s where s.id = new.part_id;
    if k1 is distinct from 'bundle' or k2 is null or k2 not in ('exterior', 'interior') then
      perform public.fail('invalid_input', 'A bundle is made of exterior and interior services.');
    end if;
  elsif tg_table_name = 'service_includes' then
    select s.kind into k1 from public.services s where s.id = new.service_id;
    select s.kind into k2 from public.services s where s.id = new.included_id;
    if k1 is null or k1 = 'addon' or k2 is distinct from 'addon' then
      perform public.fail('invalid_input', 'Only a main service or bundle can include an add-on.');
    end if;
  elsif tg_table_name = 'addon_rules' then
    select s.kind into k1 from public.services s where s.id = new.addon_id;
    if k1 is distinct from 'addon' then
      perform public.fail('invalid_input', 'Rules like this are for add-ons only.');
    end if;
  elsif tg_table_name = 'service_type_prices' then
    select s.priced_by_vehicle_type into typed from public.services s where s.id = new.service_id;
    if not coalesce(typed, false) then
      perform public.fail('invalid_input', 'This service has one price for every vehicle.');
    end if;
  end if;
  return new;
end
$$;
create trigger bundle_parts_check before insert or update on public.bundle_parts
  for each row execute function public.check_catalog_links();
create trigger service_includes_check before insert or update on public.service_includes
  for each row execute function public.check_catalog_links();
create trigger addon_rules_check before insert or update on public.addon_rules
  for each row execute function public.check_catalog_links();
create trigger service_type_prices_check before insert or update on public.service_type_prices
  for each row execute function public.check_catalog_links();

-- Saved vehicles: the owner never changes, modifications come from the list,
-- and one account keeps at most 25 saved vehicles (a limit against junk rows).
create function public.check_vehicle() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old_mods text[] := '{}';
begin
  if tg_op = 'UPDATE' then
    v_old_mods := old.modifications;
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    perform public.fail('not_allowed', 'A vehicle can''t change owner.');
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.vehicles v
                           where v.owner_id = new.owner_id and v.deleted_at is null) >= 25 then
    perform public.fail('too_many_requests', 'You can save up to 25 vehicles. Remove one to add another.');
  end if;
  new.make := btrim(new.make);
  new.model := btrim(new.model);
  new.color := nullif(btrim(new.color), '');
  -- Only newly added modifications must be current choices, so retiring a
  -- choice never blocks editing or removing a vehicle that already has it.
  if exists (
    select 1 from unnest(new.modifications) as m(code)
    where not (m.code = any (v_old_mods))
      and not exists (
        select 1 from public.form_options o
        where o.list = 'modification' and o.code = m.code and o.active)
  ) then
    perform public.fail('invalid_input', 'Choose modifications from the list.', 'modifications');
  end if;
  new.modifications := array(select distinct m from unnest(new.modifications) as m order by 1);
  return new;
end
$$;
create trigger vehicles_check before insert or update on public.vehicles
  for each row execute function public.check_vehicle();

-- ---------------------------------------------------------------------
-- Logins and profiles. A profile is created for every new login and always
-- starts as a customer. Phone and email are copied from Supabase Auth only
-- once their codes confirm them (fixes F-35, F-36).
-- ---------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  fn text := nullif(btrim(m ->> 'first_name'), '');
  ln text := nullif(btrim(m ->> 'last_name'), '');
begin
  insert into public.profiles (id, first_name, last_name, phone, email)
  values (
    new.id,
    case when public.is_valid_name(fn) then fn end,
    case when public.is_valid_name(ln) then ln end,
    case when new.phone_confirmed_at is not null then public.normalize_phone(new.phone) end,
    case when new.email_confirmed_at is not null and public.email_allowed(new.email) then lower(new.email) end
  );
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- A profile is removed only after anonymize_customer has cleared it, so
-- deleting a login first can never leave personal details on its bookings
-- (F-55). Team accounts are turned off, never deleted.
create function public.protect_profile_delete() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'wrong_state',
      detail = 'Remove this person''s details first (anonymize_customer), then delete the login. Team accounts are turned off instead.';
  end if;
  return old;
end
$$;
create trigger profiles_protect_delete before delete on public.profiles
  for each row execute function public.protect_profile_delete();

create function public.handle_auth_contact_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles p
     set phone = case when new.phone_confirmed_at is not null then public.normalize_phone(new.phone) end,
         email = case when new.email_confirmed_at is not null and public.email_allowed(new.email)
                      then lower(new.email) end
   where p.id = new.id
     and p.deleted_at is null;
  return new;
end
$$;
create trigger on_auth_user_contact_changed after update on auth.users
  for each row
  when (old.phone is distinct from new.phone
     or old.phone_confirmed_at is distinct from new.phone_confirmed_at
     or old.email is distinct from new.email
     or old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.handle_auth_contact_change();

-- ---------------------------------------------------------------------
-- Audit trail: who changed what and when. Contact details, addresses and
-- free-text notes are removed before logging (F-56).
-- ---------------------------------------------------------------------
create function public.audit_changes() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  hide constant text[] := array[
    'first_name', 'last_name', 'phone', 'email', 'contact_first', 'contact_last', 'contact_phone',
    'contact_email', 'address', 'address_zip', 'vehicle_description', 'damage_note', 'special_request',
    'photo_paths', 'shop_address', 'message', 'resolution', 'extra_cost_note', 'reason'];
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - hide end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - hide end;
  hidden_changed text[];
begin
  if tg_op = 'UPDATE' then
    -- Which private fields changed is logged, never their values.
    select coalesce(array_agg(k order by k), '{}') into hidden_changed
    from unnest(hide) as k
    where (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k);
    if (o - 'updated_at') = (n - 'updated_at') and cardinality(hidden_changed) = 0 then
      return null;
    end if;
    if cardinality(hidden_changed) > 0 then
      n := n || jsonb_build_object('private_fields_changed', to_jsonb(hidden_changed));
    end if;
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, old_value, new_value)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    coalesce(n ->> 'id', o ->> 'id', n ->> 'code', o ->> 'code', n ->> 'day', o ->> 'day',
             n ->> 'zip', o ->> 'zip', n ->> 'addon_id', o ->> 'addon_id', n ->> 'bundle_id', o ->> 'bundle_id',
             n ->> 'service_id', o ->> 'service_id'),
    o, n);
  return null;
end
$$;

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_changes();
create trigger business_settings_audit after insert or update or delete on public.business_settings
  for each row execute function public.audit_changes();
create trigger blocked_days_audit after insert or update or delete on public.blocked_days
  for each row execute function public.audit_changes();
create trigger service_zip_codes_audit after insert or update or delete on public.service_zip_codes
  for each row execute function public.audit_changes();
create trigger vehicle_types_audit after insert or update or delete on public.vehicle_types
  for each row execute function public.audit_changes();
create trigger services_audit after insert or update or delete on public.services
  for each row execute function public.audit_changes();
create trigger bundle_parts_audit after insert or update or delete on public.bundle_parts
  for each row execute function public.audit_changes();
create trigger service_includes_audit after insert or update or delete on public.service_includes
  for each row execute function public.audit_changes();
create trigger addon_rules_audit after insert or update or delete on public.addon_rules
  for each row execute function public.audit_changes();
create trigger service_type_prices_audit after insert or update or delete on public.service_type_prices
  for each row execute function public.audit_changes();
create trigger form_options_audit after insert or update or delete on public.form_options
  for each row execute function public.audit_changes();
create trigger vehicles_audit after insert or update or delete on public.vehicles
  for each row execute function public.audit_changes();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.audit_changes();
create trigger appointment_assignments_audit after insert or update or delete on public.appointment_assignments
  for each row execute function public.audit_changes();
create trigger job_requests_audit after insert or update or delete on public.job_requests
  for each row execute function public.audit_changes();
create trigger review_requests_audit after insert or update or delete on public.review_requests
  for each row execute function public.audit_changes();

-- ---------------------------------------------------------------------
-- Booking history and in-app notices. A note passed to a staff action
-- (through the ad.note setting) is shown to the customer.
-- ---------------------------------------------------------------------
create function public.notify_managers(p_kind text, p_title text, p_body text, p_appointment uuid, p_admin_only boolean default false)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, title, body, appointment_id)
  select p.id, p_kind, p_title, p_body, p_appointment
  from public.profiles p
  where p.is_active and p.deleted_at is null
    and (p.role = 'admin' or (not p_admin_only and p.role = 'manager'))
    and p.id is distinct from auth.uid()   -- never notify people about their own action
$$;

create function public.on_appointment_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_note text := nullif(current_setting('ad.note', true), '');
  v_when text := to_char(new.service_date, 'FMMon FMDD');
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_events (appointment_id, actor_id, to_status, to_queue)
    values (new.id, auth.uid(), new.status, new.queue);
    if new.queue <> 'spam' then
      perform public.notify_managers(
        case when new.status = 'confirmed' then 'new_booking' else 'new_request' end,
        case when new.status = 'confirmed' then 'New booking entered'
             when new.queue = 'review' then 'New request to review'
             else 'New booking request' end,
        'Reference ' || new.ref || ' for ' || v_when || '.',
        new.id);
    end if;
    -- The customer is told either way, so a request in Spam looks like any
    -- other. A booking that staff entered already confirmed is announced as such.
    if new.customer_id is not null then
      if new.status = 'confirmed' then
        insert into public.notifications (recipient_id, kind, title, body, appointment_id)
        values (new.customer_id, 'status_confirmed', 'Booking confirmed',
                left('Reference ' || new.ref || ', ' || v_when || '.'
                     || coalesce(' Total: $' || to_char(new.total_cents / 100.0, 'FM999990.00') || '.', ''), 500),
                new.id);
      else
        insert into public.notifications (recipient_id, kind, title, body, appointment_id)
        values (new.customer_id, 'request_received', 'Request received',
                'We''ll confirm your booking soon. Reference ' || new.ref || '.', new.id);
      end if;
    end if;
    return null;
  end if;

  if new.status is distinct from old.status or new.queue is distinct from old.queue then
    insert into public.appointment_events (appointment_id, actor_id, from_status, to_status, from_queue, to_queue, note)
    values (new.id, auth.uid(), old.status, new.status, old.queue, new.queue, v_note);
  end if;

  if new.customer_id is not null and new.status is distinct from old.status
     and new.status in ('confirmed', 'needs_information', 'declined', 'cancelled', 'completed') then
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    values (
      new.customer_id,
      'status_' || new.status::text,
      case new.status
        when 'confirmed' then 'Booking confirmed'
        when 'needs_information' then 'We need a bit more information'
        when 'declined' then 'Booking request declined'
        when 'cancelled' then 'Booking cancelled'
        else 'Job completed'
      end,
      left(coalesce(v_note || ' ', '') || 'Reference ' || new.ref || ', ' || v_when || '.', 500),
      new.id);
  end if;

  if new.customer_id is not null
     and (new.service_date, new.start_min) is distinct from (old.service_date, old.start_min)
     and new.status in ('requested', 'needs_information', 'confirmed') then
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    values (new.customer_id, 'time_changed', 'Your booking time changed',
            left(coalesce(v_note || ' ', '') || 'New time: ' || v_when || ' at '
                 || to_char(make_time(new.start_min / 60, new.start_min % 60, 0), 'FMHH12:MI AM')
                 || '. Reference ' || new.ref || '.', 500),
            new.id);
  end if;

  if new.customer_id is not null and not new.price_pending
     and (old.price_pending or new.extra_cost_cents is distinct from old.extra_cost_cents) then
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    values (new.customer_id, 'price_set', 'Your price is ready',
            'Total: $' || to_char(new.total_cents / 100.0, 'FM999990.00') || '. Reference ' || new.ref || '.',
            new.id);
  end if;
  return null;
end
$$;
create trigger appointments_events after insert or update on public.appointments
  for each row execute function public.on_appointment_change();

create function public.on_assignment_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  if tg_op = 'INSERT' then
    select * into a from public.appointments x where x.id = new.appointment_id;
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    values (new.employee_id, 'assigned', 'You have a new job',
            'Reference ' || a.ref || ', ' || to_char(a.service_date, 'FMMon FMDD') || '.', a.id);
  elsif tg_op = 'DELETE' then
    select * into a from public.appointments x where x.id = old.appointment_id;
    if found then
      insert into public.notifications (recipient_id, kind, title, body, appointment_id)
      values (old.employee_id, 'unassigned', 'Removed from a job',
              'Reference ' || a.ref || ', ' || to_char(a.service_date, 'FMMon FMDD') || '.', a.id);
    end if;
  end if;
  return null;
end
$$;
create trigger appointment_assignments_notify after insert or delete on public.appointment_assignments
  for each row execute function public.on_assignment_change();

create function public.on_job_request_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref text;
  v_name text;
begin
  select a.ref into v_ref from public.appointments a where a.id = new.appointment_id;
  if tg_op = 'INSERT' then
    select coalesce(p.first_name, 'A team member') into v_name from public.profiles p where p.id = new.employee_id;
    perform public.notify_managers('job_request', 'Request to take a job',
                                   v_name || ' asked to take ' || v_ref || '.', new.appointment_id);
  elsif new.status is distinct from old.status and new.status in ('approved', 'declined') then
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    values (new.employee_id, 'job_request_' || new.status::text,
            case when new.status = 'approved' then 'Job request approved' else 'Job request declined' end,
            'Reference ' || v_ref || '.', new.appointment_id);
  end if;
  return null;
end
$$;
create trigger job_requests_notify after insert or update on public.job_requests
  for each row execute function public.on_job_request_change();

create function public.on_review_request_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref text;
begin
  select a.ref into v_ref from public.appointments a where a.id = new.appointment_id;
  if tg_op = 'INSERT' then
    perform public.notify_managers(
      'review_request',
      case when new.for_admin then 'Admin review requested' else 'Review requested' end,
      'Reference ' || v_ref || ': ' || left(new.message, 300),
      new.appointment_id,
      new.for_admin);
  elsif new.status is distinct from old.status and new.status = 'resolved' then
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    values (new.requested_by, 'review_resolved', 'Your review request was answered',
            left('Reference ' || v_ref || '. ' || coalesce(new.resolution, ''), 500), new.appointment_id);
  end if;
  return null;
end
$$;
create trigger review_requests_notify after insert or update on public.review_requests
  for each row execute function public.on_review_request_change();

-- Booking references: AD- plus 8 characters without look-alikes (no I, O, 0, 1).
-- About a trillion combinations, and never the only key to look up a booking (F-60).
create function public.new_booking_ref() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  idx constant int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  r text := 'AD-';
  i int;
begin
  foreach i in array idx loop
    r := r || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return r;
end
$$;

-- ---------------------------------------------------------------------
-- Seed: today's menu and form choices (owner's price list, decided Oct 3).
-- Unpriced services (the bundle tiers beyond the two priced ones, ceramic and
-- wax services, plastic and rubber care, restorations) are not added until
-- they have prices.
-- ---------------------------------------------------------------------
insert into public.vehicle_types (code, name, sort) values
  ('sedan', 'Sedan', 1),
  ('coupe', 'Coupe', 2),
  ('convertible', 'Convertible', 3),
  ('crossover', 'Crossover', 4),
  ('suv', 'SUV', 5),
  ('minivan', 'Minivan', 6),
  ('truck', 'Truck', 7),
  ('large_suv', 'Large SUV', 8),
  ('van', 'Van', 9),
  ('other', 'Other', 10);

-- Minutes are provisional (decided Oct 3). Sealant and Steam Cleaning have no
-- minutes yet, so they can't be booked until the owner adds them.
insert into public.services
  (code, kind, name, description, base_price_cents, priced_by_vehicle_type, duration_min, mobile_pct, sort)
values
  ('ext_basic', 'exterior', 'Exterior Basic',
   'Snow-foam pre-wash, Brake Buster wheel and tire cleaning, tire cleaning, exterior glass, and a thorough hand wash and hand dry with professional-grade chemicals.',
   4999, false, 60, 2.5, 10),
  ('ext_deluxe', 'exterior', 'Exterior Deluxe',
   'Everything in Exterior Basic, plus Green Star pre-treatment where appropriate, Koch-Chemie Hydro Foam Sealant S0.03, enhanced gloss and water-beading protection.',
   9499, false, 90, 7, 20),
  ('int_basic', 'interior', 'Interior Basic',
   'Full interior vacuum, dash and plastics cleaned, Top Star on plastics, Gummifix on rubber and mats, interior glass and a general wipe-down.',
   5999, false, 60, 2.5, 30),
  ('int_deluxe', 'interior', 'Interior Deluxe',
   'Everything in Interior Basic, plus deep steam or shampoo, carpet and upholstery cleaning, drill-brush agitation, Pol Star and Green Star, deeper stain and dirt removal, and Leather Star conditioning. Steam cleaning included.',
   13499, false, 120, 7, 40),
  ('signature_combo', 'bundle', 'Signature Combo',
   'Exterior Basic and Interior Basic together.',
   9999, false, 120, 7, 50),
  ('full_detail', 'bundle', 'Full Detail Bundle',
   'Exterior Deluxe and Interior Deluxe together. Steam cleaning included.',
   20999, false, 210, 7, 60),
  ('perfect_finish_sealant', 'addon', 'Perfect Finish Sealant',
   'Paint protection added after a wash. Lasts about 8 to 12 weeks; don''t wash the car for about 24 hours afterwards.',
   null, true, null, 2.5, 70),
  ('steam_cleaning', 'addon', 'Steam Cleaning',
   'Deep steam treatment for carpets, upholstery and interior surfaces. Already included in Interior Deluxe.',
   4999, false, null, 2.5, 80);

insert into public.bundle_parts (bundle_id, part_id)
select b.id, p.id
from public.services b
join public.services p
  on (b.code = 'signature_combo' and p.code in ('ext_basic', 'int_basic'))
  or (b.code = 'full_detail' and p.code in ('ext_deluxe', 'int_deluxe'));

-- Interior Deluxe already includes steam: it shows as "Included" at $0 and can't be added twice.
insert into public.service_includes (service_id, included_id)
select s.id, i.id
from public.services s, public.services i
where s.code = 'int_deluxe' and i.code = 'steam_cleaning';

-- The sealant needs an exterior service. Steam Cleaning needs some main service
-- (it can't be booked alone); which services exactly is still open (X-5).
insert into public.addon_rules (addon_id, needs)
select s.id, case s.code when 'perfect_finish_sealant' then 'exterior' else 'any_main' end
from public.services s
where s.code in ('perfect_finish_sealant', 'steam_cleaning');

-- Sealant by vehicle type. Van, Convertible and Other have no price yet, so a
-- sealant on those waits for the owner's price.
insert into public.service_type_prices (service_id, vehicle_type, price_cents)
select s.id, t.vehicle_type, t.price_cents
from public.services s,
     (values ('sedan', 4499), ('coupe', 4499),
             ('crossover', 5499), ('suv', 5499), ('minivan', 5499),
             ('truck', 6499), ('large_suv', 6499)) as t(vehicle_type, price_cents)
where s.code = 'perfect_finish_sealant';

insert into public.form_options (list, code, label, is_none, sends_to_review, holds_price, requires_note, sort) values
  -- Vehicle condition (for preparation)
  ('condition', 'pet_hair', 'Pet hair', false, false, false, false, 1),
  ('condition', 'excessive_dirt', 'Excessive dirt', false, false, false, false, 2),
  ('condition', 'mud', 'Mud', false, false, false, false, 3),
  ('condition', 'heavy_brake_dust', 'Heavy brake dust', false, false, false, false, 4),
  ('condition', 'odor', 'Odor', false, false, false, false, 5),
  ('condition', 'spills', 'Spills', false, false, false, false, 6),
  ('condition', 'sand', 'Sand', false, false, false, false, 7),
  ('condition', 'embedded_debris', 'Embedded debris', false, false, false, false, 8),
  ('condition', 'mold_mildew', 'Mold or mildew', false, false, false, false, 9),
  ('condition', 'other', 'Other', false, false, false, false, 10),
  -- Modifications: recorded for preparation, never a fee
  ('modification', 'lowered', 'Lowered / coilovers', false, false, false, false, 1),
  ('modification', 'aftermarket_wheels', 'Aftermarket wheels', false, false, false, false, 2),
  ('modification', 'wide_body', 'Wide-body kit', false, false, false, false, 3),
  ('modification', 'wrap_ppf', 'Vinyl wrap / PPF', false, false, false, false, 4),
  ('modification', 'aftermarket_exhaust', 'Aftermarket exhaust', false, false, false, false, 5),
  ('modification', 'carbon_fiber', 'Carbon-fiber parts', false, false, false, false, 6),
  ('modification', 'window_tint', 'Window tint', false, false, false, false, 7),
  ('modification', 'other', 'Other', false, false, false, false, 8),
  -- Damage: Unknown and Other go to Review and need a short description (decided Oct 3)
  ('damage', 'none', 'No known damage', true, false, false, false, 1),
  ('damage', 'exterior', 'Exterior damage', false, false, false, false, 2),
  ('damage', 'interior', 'Interior damage', false, false, false, false, 3),
  ('damage', 'paint', 'Paint damage', false, false, false, false, 4),
  ('damage', 'scratches', 'Scratches', false, false, false, false, 5),
  ('damage', 'dents', 'Dents', false, false, false, false, 6),
  ('damage', 'unknown', 'Unknown', false, true, false, true, 7),
  ('damage', 'other', 'Other', false, true, false, true, 8),
  -- Stains: heavy stains hold the price until the owner sets the extra cost (proposed, X-25)
  ('stain', 'light', 'Light stains', false, false, false, false, 1),
  ('stain', 'heavy', 'Heavy stains', false, false, true, false, 2),
  ('stain', 'pet', 'Pet stains', false, false, false, false, 3),
  ('stain', 'food_drink', 'Food or drink', false, false, false, false, 4),
  ('stain', 'grease_oil', 'Grease or oil', false, false, false, false, 5),
  ('stain', 'ink_dye', 'Ink or dye', false, false, false, false, 6),
  ('stain', 'other', 'Other stains', false, false, false, false, 7);

-- Starting list: ZIP codes whose centers are under 10 miles from Parker, Texas
-- (33.0561 N, 96.6297 W). Borderline ZIPs left for the owner to decide:
-- 75072 McKinney (10.0 mi), 75407 Princeton (10.2 mi), 75042 Garland (10.3 mi).
insert into public.service_zip_codes (zip, place) values
  ('75002', 'Allen / Parker'),
  ('75094', 'Murphy / Parker / Plano'),
  ('75074', 'Plano'),
  ('75082', 'Richardson'),
  ('75013', 'Allen'),
  ('75098', 'Wylie'),
  ('75023', 'Plano'),
  ('75025', 'Plano'),
  ('75048', 'Sachse'),
  ('75075', 'Plano'),
  ('75044', 'Garland'),
  ('75040', 'Garland'),
  ('75070', 'McKinney'),
  ('75080', 'Richardson'),
  ('75069', 'McKinney'),
  ('75081', 'Richardson'),
  ('75089', 'Rowlett'),
  ('75252', 'Dallas');
