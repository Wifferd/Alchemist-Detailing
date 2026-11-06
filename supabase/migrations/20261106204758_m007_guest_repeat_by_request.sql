-- Applied to the test project on Nov 6, 2026 (version 20261106204758). Live: after review, with the owner's OK.
-- Migration 007, part 4: one request, one booking, whatever phone it is sent with again.
--
-- submit_guest_booking found a repeat only by request id AND phone. A reply lost on the network, then the phone
-- corrected and the request sent again, made a second booking for the same request (one with the wrong number),
-- both holding time for 24 hours and counting toward the guest limits. Now step 2 looks the request up by its id
-- alone: the same phone gets the first receipt as before; another phone is refused (hint request_id) and is never
-- given the first booking's receipt. Everything else is unchanged (the body is the one live runs, Migration 005).
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

  -- 2. The same request again returns the first booking. The same request with another phone (a number corrected
  -- after a lost reply) is refused: one request makes one booking, and its receipt goes only to its own number.
  select * into a from public.appointments x
   where x.customer_id is null and x.request_id = v_request
   order by x.created_at
   limit 1;
  if found then
    if a.contact_phone = v_phone then
      return public.booking_receipt(a) || jsonb_build_object('repeat', true);
    end if;
    perform public.fail('wrong_state',
      'This request was already sent. Call ' || st.public_phone || ' to change the phone number.', 'request_id');
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
