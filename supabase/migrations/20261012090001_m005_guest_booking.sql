-- Migration 005: guest booking until text codes work (Oct 12, 2026, doc 37).
--
-- The owner chose text codes through Twilio Verify (doc 36) but has no Twilio account yet, so nobody can confirm
-- a phone and nobody could book. The owner asked to "keep the guest only until i get the twillio": until then a visitor
-- books without an account, with the name and phone as typed. The owner calls or texts that number to confirm.
--
-- - business_settings.guest_booking turns it on (true on both projects now). Once Twilio Verify is connected:
--     update public.business_settings set guest_booking = false where id = 1;
--   and the site asks for the text code again (the site reads the flag from get_public_settings).
-- - submit_guest_booking(p): the same booking rules as submit_booking (read_booking_details, the slot re-check,
--   the spam field, repeats), with no account. A guest has no saved vehicles and can't add photos (photos go to an
--   account's folder). Limits: the per-customer limits apply per phone number, and all guest bookings together are
--   capped (12 an hour, 25 waiting at once), so made-up numbers can't fill the calendar.
-- - office.requests: the new requests in plain words, for the owner to read in the Supabase dashboard (Table
--   Editor, schema "office") while the owner can't sign in to the Admin page. The office schema is not served by the API.
-- - office.confirm / decline / cancel / set_extra_cost: the owner's answers, typed in the SQL Editor by reference.
--
-- Applied in four parts (the Supabase MCP times out on long migrations): 1 the setting, 2 the function, 3 the view,
-- 4 the owner's actions. Tests: db-tests/m005_tests_guest_booking.sql.

-- ---------------------------------------------------------------- 1. the setting
alter table public.business_settings add column if not exists guest_booking boolean not null default false;
comment on column public.business_settings.guest_booking is
  'Visitors may book without confirming a phone (no text codes yet, doc 37). Turn off once Twilio Verify works.';
update public.business_settings set guest_booking = true where id = 1;

create or replace function public.get_public_settings()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'timezone', s.timezone,
    'first_start_min', s.first_start_min,
    'last_start_min', s.last_start_min,
    'latest_end_min', s.latest_end_min,
    'slot_step_min', s.slot_step_min,
    'min_days_ahead', s.min_days_ahead,
    'max_days_ahead', s.max_days_ahead,
    'hold_hours', s.hold_hours,
    'public_phone', s.public_phone,
    'public_area', s.public_area,
    'mobile_radius_miles', s.mobile_radius_miles,
    'mobile_note', s.mobile_note,
    'customer_notice', s.customer_notice,
    'google_reviews_url', s.google_reviews_url,
    'guest_booking', s.guest_booking,
    'weekly_closures', (select coalesce(jsonb_agg(jsonb_build_object('weekday', w.weekday, 'start_min', w.start_min, 'end_min', w.end_min)
                                                  order by w.weekday, w.start_min), '[]'::jsonb)
                        from public.weekly_closures w))
  from public.business_settings s
  where s.id = 1
$function$;

-- ---------------------------------------------------------------- 2. the guest booking
create or replace function public.submit_guest_booking(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  st public.business_settings;
  v_request uuid;
  v_phone text;
  a public.appointments;
  r public.appointments;
  d public.booking_details;
  v_first text;
  v_last text;
  v_spam boolean;
  n int;
  n_spam int;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    perform public.fail('invalid_input', 'The booking details are missing.');
  end if;
  select * into st from public.business_settings where id = 1;

  -- 1. Only while the owner allows guest bookings; otherwise the phone is confirmed with a text code.
  if not coalesce(st.guest_booking, false) then
    perform public.fail('sign_in_required', 'Please confirm your phone number to send a booking request.', 'phone');
  end if;

  v_request := public.try_uuid(p ->> 'request_id');
  if v_request is null then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.', 'request_id');
  end if;
  v_phone := public.normalize_phone(p ->> 'phone');
  if v_phone is null then
    perform public.fail('invalid_input', 'Enter a 10-digit US mobile number, so we can reach you about the booking.', 'phone');
  end if;

  -- One guest booking at a time, so the repeats and every limit (per phone, and all guests together) are exact.
  perform pg_catalog.pg_advisory_xact_lock(7305, 0);

  -- 2. The same request again (same request and phone) returns the first booking.
  select * into a from public.appointments x
   where x.customer_id is null and x.request_id = v_request and x.contact_phone = v_phone;
  if found then
    return public.booking_receipt(a) || jsonb_build_object('repeat', true);
  end if;

  -- 3. The name as typed. The phone is as typed too, not confirmed: the owner calls or texts it to confirm.
  v_first := nullif(btrim(p ->> 'first_name'), '');
  v_last := nullif(btrim(p ->> 'last_name'), '');
  if not coalesce(public.is_valid_name(v_first), false) then
    perform public.fail('invalid_input', 'Enter your first name using letters only.', 'first_name');
  end if;
  if v_last is not null and not public.is_valid_name(v_last) then
    perform public.fail('invalid_input', 'Enter your last name using letters only, or leave it empty.', 'last_name');
  end if;

  -- 4. Vehicle, choices, location, price and time (shared rules). A guest has no saved vehicles.
  if nullif(btrim(coalesce(p ->> 'vehicle_id', '')), '') is not null then
    perform public.fail('invalid_input', 'Enter the vehicle''s make and model.', 'vehicle_make');
  end if;
  d := public.read_booking_details(p, null);

  -- 5. Photos upload to an account's own folder: a guest texts them instead.
  if coalesce(cardinality(public.json_text_array(p -> 'photos')), 0) > 0 then
    perform public.fail('invalid_input', 'You can text us photos after you book.', 'photos');
  end if;

  -- 6. The same booking sent again within a few minutes (same phone, time, place, vehicle and services)
  -- returns the first one instead of a copy.
  select * into a
  from public.appointments x
  where x.customer_id is null and x.created_by is null
    and x.contact_phone = v_phone
    and x.created_at > now() - make_interval(mins => st.repeat_window_min)
    and x.service_date = d.service_date and x.start_min = d.start_min
    and x.location_type = d.location_type
    and x.status in ('requested', 'needs_information', 'confirmed')
    and x.queue <> 'spam'
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

  -- 7. Limits: a customer's limits, per phone number; and all guest bookings together, so a run of made-up
  -- numbers can't fill the calendar.
  select count(*) into n
  from public.appointments x
  where x.customer_id is null and x.created_by is null and x.contact_phone = v_phone
    and x.status in ('requested', 'needs_information')
    and x.queue <> 'spam'
    and x.hold_expires_at > now();
  if n >= st.max_open_requests_per_customer then
    perform public.fail('too_many_requests',
      'This number already has requests waiting for confirmation. Please wait for us to reply, or call '
      || st.public_phone || '.');
  end if;
  select count(*) into n
  from public.appointments x
  where x.customer_id is null and x.created_by is null and x.contact_phone = v_phone
    and x.created_at > now() - interval '24 hours';
  if n >= st.max_requests_per_customer_per_day then
    perform public.fail('too_many_requests',
      'You''ve sent the most requests allowed for today. Please try again tomorrow, or call ' || st.public_phone || '.');
  end if;
  -- The 12 an hour count only requests still in play: a request the owner declined or cancelled frees its place,
  -- and the Spam lane (the hidden field below) has its own 12, so the bots it catches can't close booking.
  v_spam := nullif(btrim(coalesce(p ->> 'website', '')), '') is not null;
  select count(*) filter (where x.queue <> 'spam' and x.status not in ('declined', 'cancelled')),
         count(*) filter (where x.queue = 'spam')
    into n, n_spam
  from public.appointments x
  where x.customer_id is null and x.created_by is null and x.created_at > now() - interval '1 hour';
  if (case when v_spam then n_spam else n end) >= 12 then
    perform public.fail('too_many_requests',
      'We''re getting a lot of requests right now. Please call ' || st.public_phone || ' to book.');
  end if;
  select count(*) into n
  from public.appointments x
  where x.customer_id is null and x.created_by is null
    and x.status in ('requested', 'needs_information')
    and x.queue <> 'spam'
    and x.hold_expires_at > now();
  if n >= 25 then
    perform public.fail('too_many_requests',
      'We''re getting a lot of requests right now. Please call ' || st.public_phone || ' to book.');
  end if;

  -- 8. The hidden spam field (read above): saved to Spam, holds no time.

  -- 9. The time, re-checked under the day lock.
  perform public.lock_day(d.service_date);
  if not v_spam and not public.slot_is_bookable(d.service_date, d.start_min, d.duration_min, d.location_type) then
    perform public.fail('slot_unavailable', 'That time was just taken. Please choose another time.', 'start_min');
  end if;

  -- 10. Save it, in the Requests, Review or Spam lane, with no account behind it.
  r.customer_id := null;
  r.request_id := v_request;
  r.contact_first := v_first;
  r.contact_last := v_last;
  r.contact_phone := v_phone;
  r.contact_email := null;
  r.vehicle_id := null;
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
  r.status := 'requested';
  r.queue := case when v_spam then 'spam'
                  when cardinality(d.review_reasons) > 0 then 'review'
                  else 'requests' end;
  r.review_reasons := d.review_reasons || case when v_spam then array['hidden_field'] else '{}'::text[] end;
  r.hold_expires_at := case when v_spam then null else now() + make_interval(hours => st.hold_hours) end;
  r.price_pending := (d.quote ->> 'price_pending')::boolean;
  r.pending_reasons := array(select jsonb_array_elements_text(d.quote -> 'pending_reasons'));
  r.created_by := null;
  a := public.save_booking(r, d.quote);
  return public.booking_receipt(a);
end
$function$;

revoke all on function public.submit_guest_booking(jsonb) from public, anon, authenticated;
grant execute on function public.submit_guest_booking(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 3. the owner's list
create schema if not exists office;
revoke all on schema office from public, anon, authenticated;
comment on schema office is 'Plain-words lists for the owner in the Supabase dashboard. Not served by the API.';

create or replace view office.requests as
select
  a.ref as "Reference",
  to_char(a.created_at at time zone s.timezone, 'FMMon FMDD, FMHH12:MI AM') as "Received",
  case when a.status in ('requested', 'needs_information') and a.queue = 'spam' then 'Spam: holds no time'
       when a.status in ('requested', 'needs_information') and a.hold_expires_at > now()
         then 'Waiting for you: time held until ' || to_char(a.hold_expires_at at time zone s.timezone, 'FMDy FMHH12:MI AM')
       when a.status in ('requested', 'needs_information') then 'Waiting for you: time no longer held'
       else initcap(replace(a.status::text, '_', ' ')) end as "Status",
  to_char(a.service_date, 'FMDy FMMon FMDD') as "Day",
  to_char(time '00:00' + make_interval(mins => a.start_min), 'FMHH12:MI AM') || ' to '
    || to_char(time '00:00' + make_interval(mins => a.end_min), 'FMHH12:MI AM') as "Time",
  concat_ws(' ', a.contact_first, a.contact_last) as "Name",
  case when a.contact_phone ~ '^1[0-9]{10}$'
       then '(' || substr(a.contact_phone, 2, 3) || ') ' || substr(a.contact_phone, 5, 3) || '-' || substr(a.contact_phone, 8, 4)
       else a.contact_phone end as "Phone",
  case when a.customer_id is null then 'Guest: phone not confirmed' else 'Confirmed phone' end as "Who",
  case when a.location_type = 'shop' then 'At the shop'
       else 'Mobile: ' || concat_ws(', ', a.address, a.address_zip) end as "Where",
  case when a.vehicle_not_sure then coalesce(a.vehicle_description, 'Not sure')
       else concat_ws(' ', a.vehicle_year::text, a.vehicle_color, a.vehicle_make, a.vehicle_model)
            || ' (' || concat_ws(', ', a.vehicle_type, nullif(a.vehicle_size::text, 'standard')) || ')' end as "Vehicle",
  (select string_agg(i.name, ', ' order by i.sort) from public.appointment_items i
    where i.appointment_id = a.id and not i.included) as "Services",
  case when a.price_pending then 'Price to set'
       else '$' || to_char(a.total_cents / 100.0, 'FM999990.00') end as "Total",
  nullif(array_to_string(a.conditions, ', '), '') as "Condition",
  nullif(concat_ws(': ', nullif(array_to_string(a.damage, ', '), 'none'), a.damage_note), '') as "Damage",
  a.special_request as "Notes",
  a.queue::text as "Lane",
  a.created_at as "Received at"
from public.appointments a
cross join public.business_settings s
where s.id = 1
order by a.created_at desc;

revoke all on office.requests from public, anon, authenticated;
comment on view office.requests is 'Every booking request, newest first, in plain words (doc 37).';

-- ---------------------------------------------------------------- 4. the owner's actions
-- Until the owner can sign in to the Admin page (that needs a text code too), the owner answers requests from the
-- Supabase SQL Editor, by reference: select office.confirm('AD-XXXXXXXX'); and the same for decline, cancel and
-- set_extra_cost (in dollars). They do what the Admin page's buttons do, with the same checks, and say what
-- happened in words. Only the dashboard can call them: the office schema is not served by the API.
create or replace function office.find(p_ref text) returns public.appointments
 language plpgsql security definer set search_path to ''
as $function$
declare
  a public.appointments;
begin
  select * into a from public.appointments x where x.ref = upper(btrim(coalesce(p_ref, ''))) for update;
  return a;   -- all nulls when there is no such booking
end
$function$;

create or replace function office.confirm(p_ref text) returns text
 language plpgsql security definer set search_path to ''
as $function$
declare
  a public.appointments := office.find(p_ref);
begin
  if a.id is null then return 'No booking has the reference ' || coalesce(p_ref, '') || '.'; end if;
  if a.status not in ('requested', 'needs_information') then
    return a.ref || ' is ' || replace(a.status::text, '_', ' ') || ', so there is nothing to confirm.';
  end if;
  if a.price_pending then
    return a.ref || ' needs its extra cost first (for example: select office.set_extra_cost(''' || a.ref || ''', 20);), then confirm it.';
  end if;
  perform public.lock_day(a.service_date);
  if not public.slot_is_bookable(a.service_date, a.start_min, a.duration_min, a.location_type, a.id, true) then
    return a.ref || ': that time is no longer free, or has passed. Call the customer to choose another time.';
  end if;
  update public.appointments x
     set status = 'confirmed',
         queue = case when x.queue = 'spam' then 'requests'::public.intake_queue else x.queue end,
         hold_expires_at = null
   where x.id = a.id;
  return 'Confirmed ' || a.ref || ': ' || to_char(a.service_date, 'FMDy FMMon FMDD') || ' at '
         || to_char(time '00:00' + make_interval(mins => a.start_min), 'FMHH12:MI AM') || '. The time is kept.';
end
$function$;

create or replace function office.decline(p_ref text) returns text
 language plpgsql security definer set search_path to ''
as $function$
declare
  a public.appointments := office.find(p_ref);
begin
  if a.id is null then return 'No booking has the reference ' || coalesce(p_ref, '') || '.'; end if;
  if a.status not in ('requested', 'needs_information') then
    return a.ref || ' is ' || replace(a.status::text, '_', ' ') || '. Only a request waiting for an answer can be declined (use office.cancel for a confirmed one).';
  end if;
  update public.appointments x set status = 'declined', hold_expires_at = null where x.id = a.id;
  return 'Declined ' || a.ref || '. Its time is free again.';
end
$function$;

create or replace function office.cancel(p_ref text) returns text
 language plpgsql security definer set search_path to ''
as $function$
declare
  a public.appointments := office.find(p_ref);
begin
  if a.id is null then return 'No booking has the reference ' || coalesce(p_ref, '') || '.'; end if;
  if a.status not in ('requested', 'needs_information', 'confirmed', 'in_progress') then
    return a.ref || ' is already ' || replace(a.status::text, '_', ' ') || '.';
  end if;
  update public.appointments x set status = 'cancelled', hold_expires_at = null where x.id = a.id;
  return 'Cancelled ' || a.ref || '. Its time is free again.';
end
$function$;

create or replace function office.set_extra_cost(p_ref text, p_dollars numeric, p_note text default null) returns text
 language plpgsql security definer set search_path to ''
as $function$
declare
  a public.appointments := office.find(p_ref);
  v text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if a.id is null then return 'No booking has the reference ' || coalesce(p_ref, '') || '.'; end if;
  if a.status not in ('requested', 'needs_information', 'confirmed', 'in_progress') then
    return a.ref || ' is already ' || replace(a.status::text, '_', ' ') || '.';
  end if;
  if p_dollars is null or p_dollars < 0 or p_dollars > 10000 then
    return 'Enter an amount between 0 and 10000 dollars.';
  end if;
  if v is not null and (char_length(v) > 500 or not public.is_clean_text(v)) then
    return 'Keep the note under 500 characters, with no links.';
  end if;
  update public.appointments x
     set extra_cost_cents = round(p_dollars * 100)::int,
         extra_cost_note = v,
         price_pending = false,
         pending_reasons = '{}'
   where x.id = a.id;
  return a.ref || ': extra cost set to $' || to_char(p_dollars, 'FM99990.00') || '. Total now $'
         || to_char((select x.total_cents from public.appointments x where x.id = a.id) / 100.0, 'FM999990.00') || '.';
end
$function$;

revoke all on function office.find(text), office.confirm(text), office.decline(text), office.cancel(text),
  office.set_extra_cost(text, numeric, text) from public, anon, authenticated;
