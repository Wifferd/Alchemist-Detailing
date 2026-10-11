-- Migration 004: sign-in by email code (the owner's choice of Oct 11 2026).
-- The owner chose Resend for codes and booking messages, and Resend sends email
-- only, so customers and staff now confirm an email address with a 6-digit code
-- instead of a phone number with a text (doc 33). In the database:
--   * A booking needs a signed-in, non-anonymous login whose email is confirmed,
--     or whose phone is confirmed (so texts could come back without another
--     migration). An email-only login must use a regular address (email_allowed).
--   * Every booking still carries a US contact phone. For an email-confirmed
--     customer it is the number typed on the booking (contact_phone in the
--     request), kept on the profile as contact_phone (not unique and not
--     confirmed: the owner calls or texts it himself). A confirmed phone wins.
--   * Vehicle photos: a customer with a confirmed email (or phone) may upload.
--   * Staff booking for an account: its confirmed phone, else the phone staff
--     enter, else the account's contact phone.
--   * bootstrap_admin takes the owner's email (or a confirmed phone).
--   * Removing a profile (anonymize_customer) also clears the contact phone.
-- Unchanged: the auth triggers already copy a confirmed, allowed email to the
-- profile; roles, aal2 for managers and the admin, RLS and grants (functions
-- replaced in place keep their grants).
-- Applied to the test project on Oct 11 2026 in six parts with the same SQL
-- (the Supabase tool times out on one long migration, and holds any text with
-- a delete in it for a confirmation): the column, submit_booking,
-- staff_create_booking, the photo upload rule, bootstrap_admin, the trigger.

alter table public.profiles add column contact_phone text;
alter table public.profiles add constraint profiles_contact_phone_ok
  check (contact_phone is null or contact_phone ~ '^1[2-9][0-9]{9}$');
comment on column public.profiles.contact_phone is
  'The phone number the customer typed on their latest booking (Migration 004). Not confirmed by a code; profiles.phone is a confirmed one.';

-- A booking request from the website (otherwise unchanged from Migration 001).
create or replace function public.submit_booking(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  st public.business_settings;
  au record;
  prof public.profiles;
  v_request uuid;
  a public.appointments;
  r public.appointments;
  d public.booking_details;
  v_first text;
  v_last text;
  v_phone text;
  v_photos text[];
  v_spam boolean;
  n int;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    perform public.fail('invalid_input', 'The booking details are missing.');
  end if;

  -- 1. A signed-in user whose email is confirmed by the 6-digit email code
  -- (Migration 004), or whose phone is confirmed by a text code.
  if uid is null then
    perform public.fail('sign_in_required', 'Please confirm your email to send a booking request.', 'email');
  end if;
  select u.phone, u.phone_confirmed_at, u.email, u.email_confirmed_at, coalesce(u.is_anonymous, false) as is_anonymous
    into au
  from auth.users u
  where u.id = uid;
  if not found or au.is_anonymous
     or ((au.phone_confirmed_at is null or public.normalize_phone(au.phone) is null)
         and (au.email_confirmed_at is null or nullif(btrim(coalesce(au.email, '')), '') is null)) then
    perform public.fail('email_not_verified', 'Confirm your email with the 6-digit code first.', 'email');
  end if;
  select * into st from public.business_settings where id = 1;

  v_request := public.try_uuid(p ->> 'request_id');
  if nullif(btrim(p ->> 'request_id'), '') is not null and v_request is null then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.', 'request_id');
  end if;

  -- One booking at a time per customer, so repeats and limits are exact. The
  -- profile is held until the booking is saved, so it can't be removed meanwhile.
  perform public.lock_customer(uid);
  select * into prof from public.profiles x where x.id = uid for share;
  if not found or not prof.is_active or prof.deleted_at is not null then
    perform public.fail('not_allowed', 'This account can''t send booking requests. Please call us.');
  end if;
  -- Migration 004: a login confirmed by email only books with that email, so it has to be a regular
  -- address (the profile keeps an email only when email_allowed passes it).
  if (au.phone_confirmed_at is null or public.normalize_phone(au.phone) is null) and prof.email is null then
    perform public.fail('email_not_allowed', 'Use a regular email address, not a throwaway one.', 'email');
  end if;

  -- 2. The same request again returns the first booking (F-04).
  if v_request is not null then
    select * into a from public.appointments x where x.customer_id = uid and x.request_id = v_request;
    if found then
      return public.booking_receipt(a) || jsonb_build_object('repeat', true);
    end if;
  end if;

  -- 3. Contact details: the name from the profile, or as typed when the
  -- profile has none (then saved to it). The email comes only from Supabase
  -- Auth, once confirmed. The phone: a confirmed one (text code) when there is
  -- one; otherwise the number typed on this booking (Migration 004), checked
  -- for a US format and kept on the profile as contact_phone for next time.
  -- It isn't confirmed by a code: the owner calls or texts it himself.
  v_first := coalesce(prof.first_name, nullif(btrim(p ->> 'first_name'), ''));
  v_last := coalesce(prof.last_name, nullif(btrim(p ->> 'last_name'), ''));
  if not coalesce(public.is_valid_name(v_first), false) then
    perform public.fail('invalid_input', 'Enter your first name using letters only.', 'first_name');
  end if;
  if v_last is not null and not public.is_valid_name(v_last) then
    perform public.fail('invalid_input', 'Enter your last name using letters only, or leave it empty.', 'last_name');
  end if;
  if prof.first_name is null or (prof.last_name is null and v_last is not null) then
    update public.profiles x
       set first_name = coalesce(x.first_name, v_first),
           last_name = coalesce(x.last_name, v_last)
     where x.id = uid;
  end if;
  v_phone := case when au.phone_confirmed_at is not null then public.normalize_phone(au.phone) end;
  if v_phone is null then
    v_phone := public.normalize_phone(p ->> 'contact_phone');
    if v_phone is null then
      perform public.fail('invalid_input', 'Enter a 10-digit US mobile number, so we can reach you about the booking.', 'phone');
    end if;
    if prof.contact_phone is distinct from v_phone then
      update public.profiles x set contact_phone = v_phone where x.id = uid;
    end if;
  end if;

  -- 4. Vehicle, choices, location, price and time (shared rules).
  d := public.read_booking_details(p, uid);

  -- 5. Photos: up to 6, already uploaded to the caller's own folder (F-54).
  v_photos := public.json_text_array(p -> 'photos');
  if cardinality(v_photos) > 6 then
    perform public.fail('invalid_input', 'Add up to 6 photos.', 'photos');
  end if;
  if exists (select 1 from unnest(v_photos) as x(name) where not public.is_vehicle_photo_name(x.name, uid)) then
    perform public.fail('invalid_input', 'One of the photos isn''t valid. Please add it again.', 'photos');
  end if;
  if exists (select 1 from unnest(v_photos) as x(name)
             where not exists (select 1 from storage.objects o
                               where o.bucket_id = 'vehicle-photos' and o.name = x.name)) then
    perform public.fail('invalid_input', 'A photo didn''t finish uploading. Please add it again.', 'photos');
  end if;

  -- 6. The same booking sent again within a few minutes (same time, place,
  -- vehicle and services) returns the first one instead of a copy.
  select * into a
  from public.appointments x
  where x.customer_id = uid
    and x.created_at > now() - make_interval(mins => st.repeat_window_min)
    and x.service_date = d.service_date and x.start_min = d.start_min
    and x.location_type = d.location_type
    and x.status in ('requested', 'needs_information', 'confirmed')
    and x.queue <> 'spam'
    and x.vehicle_id is not distinct from d.vehicle_id
    and x.vehicle_make is not distinct from d.vehicle_make
    and x.vehicle_model is not distinct from d.vehicle_model
    and x.vehicle_type is not distinct from d.vehicle_type
    and x.vehicle_size = d.vehicle_size
    and x.vehicle_not_sure = d.vehicle_not_sure
    and x.vehicle_description is not distinct from d.vehicle_description
    and x.address is not distinct from d.address
    and x.address_zip is not distinct from d.address_zip
    and array(select i.code from public.appointment_items i
              where i.appointment_id = x.id and not i.included order by 1) = d.codes
  order by x.created_at desc
  limit 1;
  if found then
    return public.booking_receipt(a) || jsonb_build_object('repeat', true);
  end if;

  -- 7. Limits per customer (admin can change them). Bookings that staff
  -- entered for the customer don't count.
  select count(*) into n
  from public.appointments x
  where x.customer_id = uid
    and x.created_by = uid
    and x.status in ('requested', 'needs_information')
    and x.queue <> 'spam'
    and x.hold_expires_at > now();
  if n >= st.max_open_requests_per_customer then
    perform public.fail('too_many_requests',
      'You already have ' || n || ' requests waiting for confirmation. Please wait for us to reply, or call '
      || st.public_phone || '.');
  end if;
  select count(*) into n
  from public.appointments x
  where x.customer_id = uid and x.created_by = uid and x.created_at > now() - interval '24 hours';
  if n >= st.max_requests_per_customer_per_day then
    perform public.fail('too_many_requests',
      'You''ve sent the most requests allowed for today. Please try again tomorrow, or call ' || st.public_phone || '.');
  end if;

  -- 8. The hidden spam field: saved to Spam, holds no time (F-31).
  v_spam := nullif(btrim(coalesce(p ->> 'website', '')), '') is not null;

  -- 9. The time, re-checked under the day lock.
  perform public.lock_day(d.service_date);
  if not v_spam and not public.slot_is_bookable(d.service_date, d.start_min, d.duration_min, d.location_type) then
    perform public.fail('slot_unavailable', 'That time was just taken. Please choose another time.', 'start_min');
  end if;

  -- 10. Save it, in the Requests, Review or Spam lane.
  r.customer_id := uid;
  r.request_id := v_request;
  r.contact_first := v_first;
  r.contact_last := v_last;
  r.contact_phone := v_phone;
  r.contact_email := prof.email;
  r.vehicle_id := d.vehicle_id;
  r.vehicle_make := d.vehicle_make;
  r.vehicle_model := d.vehicle_model;
  r.vehicle_year := d.vehicle_year;
  r.vehicle_color := d.vehicle_color;
  r.vehicle_type := d.vehicle_type;
  r.vehicle_size := d.vehicle_size;
  r.vehicle_not_sure := d.vehicle_not_sure;
  r.vehicle_description := d.vehicle_description;
  r.modifications := d.modifications;
  r.conditions := d.conditions;
  r.stains := d.stains;
  r.damage := d.damage;
  r.damage_note := d.damage_note;
  r.special_request := d.special_request;
  r.photo_paths := v_photos;
  r.location_type := d.location_type;
  r.address := d.address;
  r.address_zip := d.address_zip;
  r.service_date := d.service_date;
  r.start_min := d.start_min;
  r.duration_min := d.duration_min;
  r.status := 'requested';
  r.queue := case when v_spam then 'spam'
                  when cardinality(d.review_reasons) > 0 then 'review'
                  else 'requests' end;
  r.review_reasons := d.review_reasons || case when v_spam then array['hidden_field'] else '{}'::text[] end;
  r.hold_expires_at := case when v_spam then null else now() + make_interval(hours => st.hold_hours) end;
  r.price_pending := (d.quote ->> 'price_pending')::boolean;
  r.pending_reasons := array(select jsonb_array_elements_text(d.quote -> 'pending_reasons'));
  r.created_by := uid;
  a := public.save_booking(r, d.quote);
  return public.booking_receipt(a);
end
$$;
comment on function public.submit_booking(jsonb) is
  'Booking request from a signed-in user with a confirmed email (or a confirmed phone). The contact phone is typed on the booking unless the phone is confirmed. Errors: SQLSTATE P0001, message = code, detail = text to show, hint = field.';

-- A booking entered by staff (otherwise unchanged from Migration 001).
create or replace function public.staff_create_booking(p jsonb) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  st public.business_settings;
  d public.booking_details;
  prof public.profiles;
  a public.appointments;
  r public.appointments;
  v_request uuid;
  v_customer uuid;
  v_extra int;
  v_extra_note text;
  v_pending boolean;
begin
  perform public.assert_manager();
  if jsonb_typeof(p) is distinct from 'object' then
    perform public.fail('invalid_input', 'The booking details are missing.');
  end if;
  select * into st from public.business_settings where id = 1;

  -- Every entry carries a request ID from the staff screen, so a double click
  -- or a retry saves one booking, never two.
  v_request := public.try_uuid(p ->> 'request_id');
  if v_request is null then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.', 'request_id');
  end if;
  perform public.lock_customer(auth.uid());
  select * into a from public.appointments x where x.created_by = auth.uid() and x.request_id = v_request;
  if found then
    return a;
  end if;

  -- The customer: an existing customer account picked by staff (held until
  -- the booking is saved, so it can't be removed meanwhile), or the details
  -- as told on the phone.
  if nullif(btrim(p ->> 'customer_id'), '') is not null then
    v_customer := public.try_uuid(p ->> 'customer_id');
    select * into prof from public.profiles x
    where x.id = v_customer and x.role = 'customer' and x.is_active and x.deleted_at is null
    for share;
    if not found then
      perform public.fail('not_found', 'That customer account wasn''t found.', 'customer_id');
    end if;
    -- Migration 004: an account may have a confirmed email and no confirmed
    -- phone. Its phone is then the one staff enter now, or else the one the
    -- customer typed on an earlier booking (profiles.contact_phone).
    if nullif(btrim(coalesce(p ->> 'contact_phone', '')), '') is not null
       and public.normalize_phone(p ->> 'contact_phone') is null then
      perform public.fail('invalid_input', 'Enter the customer''s US phone number.', 'contact_phone');
    end if;
    if prof.phone is not null
       and nullif(btrim(coalesce(p ->> 'contact_phone', '')), '') is not null
       and public.normalize_phone(p ->> 'contact_phone') is distinct from prof.phone then
      perform public.fail('invalid_input', 'That phone number doesn''t match the account. Check that this is the right customer.', 'contact_phone');
    end if;
    r.contact_first := coalesce(prof.first_name, nullif(btrim(p ->> 'contact_first'), ''));
    r.contact_last := coalesce(prof.last_name, nullif(btrim(p ->> 'contact_last'), ''));
    r.contact_phone := coalesce(prof.phone, public.normalize_phone(p ->> 'contact_phone'), prof.contact_phone);
    r.contact_email := prof.email;
    if r.contact_phone is null then
      perform public.fail('invalid_input', 'That account has no phone number yet. Enter the customer''s US phone number.', 'contact_phone');
    end if;
  else
    r.contact_first := nullif(btrim(p ->> 'contact_first'), '');
    r.contact_last := nullif(btrim(p ->> 'contact_last'), '');
    r.contact_phone := public.normalize_phone(p ->> 'contact_phone');
    r.contact_email := lower(nullif(btrim(p ->> 'contact_email'), ''));
    if r.contact_phone is null then
      perform public.fail('invalid_input', 'Enter the customer''s US phone number.', 'contact_phone');
    end if;
    if r.contact_email is not null and not public.email_allowed(r.contact_email) then
      perform public.fail('invalid_input', 'Enter a real email address, or leave it empty.', 'contact_email');
    end if;
  end if;
  if not coalesce(public.is_valid_name(r.contact_first), false) then
    perform public.fail('invalid_input', 'Enter the customer''s first name using letters only.', 'contact_first');
  end if;
  if r.contact_last is not null and not public.is_valid_name(r.contact_last) then
    perform public.fail('invalid_input', 'Enter the customer''s last name using letters only, or leave it empty.', 'contact_last');
  end if;

  -- Vehicle, choices, location, price and time: the same rules as online.
  d := public.read_booking_details(p, v_customer);

  -- The extra cost: the admin only (decided Oct 3).
  if nullif(btrim(coalesce(p ->> 'extra_cost_cents', '')), '') is not null then
    if not public.is_admin() then
      perform public.fail('not_allowed', 'Only the admin can set the extra cost.', 'extra_cost_cents');
    end if;
    v_extra := public.try_int(p ->> 'extra_cost_cents');
    if v_extra is null or v_extra < 0 or v_extra > 1000000 then
      perform public.fail('invalid_input', 'Enter an amount between $0 and $10,000.', 'extra_cost_cents');
    end if;
    v_extra_note := nullif(btrim(p ->> 'extra_cost_note'), '');
    if v_extra_note is not null and (char_length(v_extra_note) > 500 or not public.is_clean_text(v_extra_note)) then
      perform public.fail('invalid_input', 'Keep the note under 500 characters, with no links.', 'extra_cost_note');
    end if;
  end if;

  -- The time, under the day lock.
  perform public.lock_day(d.service_date);
  if not public.slot_is_bookable(d.service_date, d.start_min, d.duration_min, d.location_type, null, true) then
    perform public.fail('slot_unavailable', 'That time isn''t free, or is outside opening hours.', 'start_min');
  end if;

  v_pending := (d.quote ->> 'price_pending')::boolean and v_extra is null;
  r.customer_id := v_customer;
  r.request_id := v_request;
  r.vehicle_id := d.vehicle_id;
  r.vehicle_make := d.vehicle_make;
  r.vehicle_model := d.vehicle_model;
  r.vehicle_year := d.vehicle_year;
  r.vehicle_color := d.vehicle_color;
  r.vehicle_type := d.vehicle_type;
  r.vehicle_size := d.vehicle_size;
  r.vehicle_not_sure := d.vehicle_not_sure;
  r.vehicle_description := d.vehicle_description;
  r.modifications := d.modifications;
  r.conditions := d.conditions;
  r.stains := d.stains;
  r.damage := d.damage;
  r.damage_note := d.damage_note;
  r.special_request := d.special_request;
  r.photo_paths := '{}';
  r.location_type := d.location_type;
  r.address := d.address;
  r.address_zip := d.address_zip;
  r.service_date := d.service_date;
  r.start_min := d.start_min;
  r.duration_min := d.duration_min;
  r.status := case when v_pending then 'requested' else 'confirmed' end;
  r.queue := 'requests';
  r.review_reasons := '{}';
  r.hold_expires_at := case when v_pending then now() + make_interval(hours => st.hold_hours) end;
  r.price_pending := v_pending;
  r.pending_reasons := case when v_pending
                            then array(select jsonb_array_elements_text(d.quote -> 'pending_reasons'))
                            else '{}' end;
  r.extra_cost_cents := v_extra;
  r.extra_cost_note := v_extra_note;
  r.created_by := auth.uid();
  return public.save_booking(r, d.quote);
end
$$;
-- Upload: customers whose email or phone is confirmed (otherwise unchanged).
create or replace function public.can_upload_vehicle_photo(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'customer' and p.is_active
                   and p.deleted_at is null and (p.phone is not null or p.email is not null))
     and public.is_vehicle_photo_name(p_name, auth.uid())
     and (select count(*) from storage.objects o
          where o.bucket_id = 'vehicle-photos'
            and o.name like auth.uid()::text || '/%') < 60
$$;
-- Removing a profile (anonymize_customer sets deleted_at) also clears its
-- contact phone. A trigger rather than a change to anonymize_customer, so every
-- way a profile is removed does it.
create function public.clear_contact_phone_on_removal() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.contact_phone := null;
  return new;
end
$$;
create trigger profiles_clear_contact_phone before update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.clear_contact_phone_on_removal();

-- One-time owner setup, now by email: after signing in on the site with the
-- email code, run this once from the SQL editor to make that account the admin.
-- The argument keeps its Migration 001 name (p_phone) so the function is
-- replaced in place with its grants (service_role only); it takes the email the
-- owner signed in with, or a confirmed phone as before.
create or replace function public.bootstrap_admin(p_phone text) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(nullif(btrim(coalesce(p_phone, '')), ''));
  v_phone text := public.normalize_phone(p_phone);
  v_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(7304, 0);
  if exists (select 1 from public.profiles x where x.role = 'admin' and x.deleted_at is null) then
    perform public.fail('wrong_state', 'An admin already exists. Use set_user_role instead.');
  end if;
  if v_email is not null and position('@' in v_email) > 0 then
    select x.id into v_id from public.profiles x where x.email = v_email and x.deleted_at is null;
    if v_id is null then
      perform public.fail('not_found', 'No account with that confirmed email. Sign in on the site with the email code first.');
    end if;
  elsif v_phone is not null then
    select x.id into v_id from public.profiles x where x.phone = v_phone and x.deleted_at is null;
    if v_id is null then
      perform public.fail('not_found', 'No account with that confirmed phone number. Sign in on the site first.');
    end if;
  else
    perform public.fail('invalid_input', 'Enter the email (or confirmed phone) the owner signed in with.', 'email');
  end if;
  update public.profiles x set role = 'admin', is_active = true where x.id = v_id;
  return v_id;
end
$$;
