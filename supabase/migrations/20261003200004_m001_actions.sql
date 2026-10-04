-- Alchemist Detailing — Migration 001, file 4 of 6: customer, staff and admin actions
-- Apply in order; see file 1 for the overview and conventions.

-- ---------------------------------------------------------------------
-- Shared pieces for staff actions.
-- ---------------------------------------------------------------------

-- A note passed to a staff action. Notes on status and time changes are
-- shown to the customer, so they're kept short and link-free.
create function public.set_action_note(p_note text) returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v is not null and (char_length(v) > 500 or not public.is_clean_text(v)) then
    perform public.fail('invalid_input', 'Keep the note under 500 characters, with no links.', 'note');
  end if;
  perform pg_catalog.set_config('ad.note', coalesce(v, ''), true);
  return v;
end
$$;

create function public.clear_action_note() returns void
language sql volatile set search_path = ''
as $$
  select pg_catalog.set_config('ad.note', '', true);
$$;

-- Loads a booking and locks its row for the rest of the action.
create function public.booking_for_update(p_id uuid) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments x where x.id = p_id for update;
  if not found then
    perform public.fail('not_found', 'That booking wasn''t found.');
  end if;
  return a;
end
$$;

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------

-- The caller's own bookings, customer columns only (F-50). A confirmed or
-- in-progress "Come to us" booking also shows the owner's address; team
-- members are shown by first name.
create function public.my_bookings() returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_signed_in();
  return query
    select public.booking_receipt(a) || jsonb_build_object(
             'shop_address', case when a.location_type = 'shop' and a.status in ('confirmed', 'in_progress')
                                  then s.shop_address end,
             'team', case when a.status in ('confirmed', 'in_progress', 'completed') then coalesce((
                        select jsonb_agg(pr.first_name order by x.created_at)
                        from public.appointment_assignments x
                        join public.profiles pr on pr.id = x.employee_id
                        where x.appointment_id = a.id and pr.first_name is not null), '[]'::jsonb)
                      else '[]'::jsonb end,
             'history', coalesce((
                        select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at, 'note', e.note)
                                         order by e.created_at, e.id)
                        from public.appointment_events e
                        where e.appointment_id = a.id and e.from_status is distinct from e.to_status), '[]'::jsonb))
    from public.appointments a
    cross join public.business_settings s
    where s.id = 1
      and a.customer_id = auth.uid()
      and a.anonymized_at is null
    order by a.service_date desc, a.start_min desc;
end
$$;

-- First and last name on the caller's own profile. Leave the last name out
-- to keep it; send an empty one to remove it. Phone and email change only
-- through Supabase Auth, with a code.
create function public.update_my_profile(p_first_name text, p_last_name text default null)
returns public.profiles
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_first text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last text := nullif(btrim(coalesce(p_last_name, '')), '');
  r public.profiles;
begin
  perform public.assert_signed_in();
  if not coalesce(public.is_valid_name(v_first), false) then
    perform public.fail('invalid_input', 'Enter your first name using letters only.', 'first_name');
  end if;
  if v_last is not null and not public.is_valid_name(v_last) then
    perform public.fail('invalid_input', 'Enter your last name using letters only, or leave it empty.', 'last_name');
  end if;
  update public.profiles x
     set first_name = v_first,
         last_name = case when p_last_name is null then x.last_name else v_last end
   where x.id = auth.uid()
  returning * into r;
  return r;
end
$$;

-- Removes a saved vehicle from the list. Past bookings keep their own copy.
create function public.delete_my_vehicle(p_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.assert_signed_in();
  update public.vehicles v
     set deleted_at = now()
   where v.id = p_id and v.owner_id = auth.uid() and v.deleted_at is null;
  if not found then
    perform public.fail('not_found', 'That vehicle wasn''t found.');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Managers and the admin (Section 11). Each action checks the role and the
-- authenticator-app step itself.
-- ---------------------------------------------------------------------

-- Approve a request. Approval makes the hold permanent. The time is checked
-- again under the day lock, in case the hold lapsed and someone else booked
-- it. A booking whose price waits for the extra cost can't be confirmed
-- until the admin sets it, so a customer is never confirmed without a price.
create function public.confirm_booking(p_id uuid, p_note text default null)
returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status not in ('requested', 'needs_information') then
    perform public.fail('wrong_state', 'Only requests waiting for a decision can be confirmed.');
  end if;
  if a.price_pending then
    perform public.fail('wrong_state', 'The admin needs to set the extra cost first, so the customer sees the full price.');
  end if;
  perform public.lock_day(a.service_date);
  if not public.slot_is_bookable(a.service_date, a.start_min, a.duration_min, a.location_type, a.id, true) then
    perform public.fail('slot_unavailable', 'That time is no longer free, or has passed. Set a new time first.');
  end if;
  perform public.set_action_note(p_note);
  update public.appointments x
     set status = 'confirmed',
         queue = case when x.queue = 'spam' then 'requests'::public.intake_queue else x.queue end,
         hold_expires_at = null
   where x.id = a.id
  returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;

create function public.decline_booking(p_id uuid, p_note text default null)
returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status not in ('requested', 'needs_information') then
    perform public.fail('wrong_state', 'Only requests waiting for a decision can be declined. The admin cancels confirmed bookings.');
  end if;
  perform public.set_action_note(p_note);
  update public.appointments x
     set status = 'declined', hold_expires_at = null
   where x.id = a.id
  returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;

-- Ask the customer for more information. The note says what is needed and
-- is shown to the customer. The request keeps its current hold.
create function public.ask_for_information(p_id uuid, p_note text)
returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status <> 'requested' then
    perform public.fail('wrong_state', 'Only new requests can be sent back for more information.');
  end if;
  if public.set_action_note(p_note) is null then
    perform public.fail('invalid_input', 'Say what information you need.', 'note');
  end if;
  update public.appointments x
     set status = 'needs_information'
   where x.id = a.id
  returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;

-- Move a booking to a new day, start time or length (for example, shorter
-- when more people work the car). Both days are locked; the new time and
-- every assigned person's limits are checked. A request that is moved holds
-- its new time for a fresh hold period. A job can be made shorter at any
-- time, even once started, since that only frees time.
create function public.set_booking_time(p_id uuid, p_date date, p_start_min int,
                                        p_duration_min int default null, p_note text default null)
returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  st public.business_settings;
  v_duration int;
  v_shorter_only boolean;
  emp record;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status not in ('requested', 'needs_information', 'confirmed', 'in_progress') then
    perform public.fail('wrong_state', 'This booking''s time can''t be changed now.');
  end if;
  v_duration := coalesce(p_duration_min, a.duration_min);
  if p_date is null or p_start_min is null then
    perform public.fail('invalid_input', 'Choose a day and a start time.', 'service_date');
  end if;
  if v_duration < 5 or v_duration > 720 then
    perform public.fail('invalid_input', 'The length must be between 5 minutes and 12 hours.', 'duration_min');
  end if;
  v_shorter_only := p_date = a.service_date and p_start_min = a.start_min and v_duration <= a.duration_min;
  if a.status = 'in_progress' and not v_shorter_only then
    perform public.fail('wrong_state', 'A job in progress can only be made shorter.', 'duration_min');
  end if;
  select * into st from public.business_settings where id = 1;

  perform public.lock_day(least(a.service_date, p_date));
  if p_date <> a.service_date then
    perform public.lock_day(greatest(a.service_date, p_date));
  end if;
  if not v_shorter_only then
    if not public.slot_is_bookable(p_date, p_start_min, v_duration, a.location_type, a.id, true) then
      perform public.fail('slot_unavailable', 'That time isn''t free, or is outside opening hours.', 'start_min');
    end if;
    for emp in
      select x.employee_id, coalesce(pr.first_name, 'A team member') as name
      from public.appointment_assignments x
      join public.profiles pr on pr.id = x.employee_id
      where x.appointment_id = a.id
      order by x.employee_id
    loop
      perform public.lock_person(emp.employee_id);
      if public.person_conflicts(emp.employee_id, p_date, p_start_min, v_duration, a.location_type, a.id) then
        perform public.fail('slot_unavailable', emp.name || ' already has a job at that time.', 'start_min');
      end if;
    end loop;
  end if;

  perform public.set_action_note(p_note);
  update public.appointments x
     set service_date = p_date,
         start_min = p_start_min,
         duration_min = v_duration,
         hold_expires_at = case
           when x.status in ('requested', 'needs_information') and x.queue <> 'spam'
             then greatest(coalesce(x.hold_expires_at, now()), now() + make_interval(hours => st.hold_hours))
           else x.hold_expires_at end
   where x.id = a.id
  returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;

-- Move a request between the Requests, Review and Spam lanes. Out of Spam,
-- it holds time again, so its time is checked first; into Spam, it stops
-- holding time.
create function public.set_booking_lane(p_id uuid, p_lane text, p_note text default null)
returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  st public.business_settings;
  v_lane public.intake_queue;
  v_hold timestamptz;
begin
  perform public.assert_manager();
  if p_lane is null or p_lane not in ('requests', 'review', 'spam') then
    perform public.fail('invalid_input', 'Choose Requests, Review or Spam.', 'lane');
  end if;
  v_lane := p_lane::public.intake_queue;
  a := public.booking_for_update(p_id);
  if a.status not in ('requested', 'needs_information') then
    perform public.fail('wrong_state', 'Only requests waiting for a decision can change lanes.');
  end if;
  if v_lane = a.queue then
    return a;
  end if;
  select * into st from public.business_settings where id = 1;
  v_hold := a.hold_expires_at;
  if a.queue = 'spam' then
    perform public.lock_day(a.service_date);
    if not public.slot_is_bookable(a.service_date, a.start_min, a.duration_min, a.location_type, a.id, true) then
      perform public.fail('slot_unavailable', 'Its time is no longer free. Set a new time first.');
    end if;
    v_hold := now() + make_interval(hours => st.hold_hours);
  elsif v_lane = 'spam' then
    v_hold := null;
  end if;
  perform public.set_action_note(p_note);
  update public.appointments x
     set queue = v_lane,
         hold_expires_at = v_hold,
         review_reasons = case when v_lane = 'review' and not ('staff' = any (x.review_reasons))
                               then x.review_reasons || 'staff'::text else x.review_reasons end
   where x.id = a.id
  returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;

create function public.start_booking(p_id uuid) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status <> 'confirmed' then
    perform public.fail('wrong_state', 'Only confirmed bookings can be started.');
  end if;
  update public.appointments x set status = 'in_progress' where x.id = a.id returning * into a;
  return a;
end
$$;

create function public.complete_booking(p_id uuid, p_note text default null) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status not in ('confirmed', 'in_progress') then
    perform public.fail('wrong_state', 'Only confirmed or started bookings can be completed.');
  end if;
  perform public.set_action_note(p_note);
  update public.appointments x set status = 'completed' where x.id = a.id returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;

-- Assign a team member to a confirmed job. Several people can work one car;
-- each person stays within their own limit (2 driveway cars or 1 mobile job
-- at once, never both). Approves their open request for the job, if any.
create function public.assign_employee(p_appointment uuid, p_employee uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_appointment);
  if a.status not in ('confirmed', 'in_progress') then
    perform public.fail('wrong_state', 'Confirm the booking before assigning someone.');
  end if;
  if not exists (select 1 from public.profiles pr
                 where pr.id = p_employee and pr.role in ('detailer', 'manager', 'admin')
                   and pr.is_active and pr.deleted_at is null) then
    perform public.fail('not_found', 'That team member wasn''t found.', 'employee');
  end if;
  if exists (select 1 from public.appointment_assignments x
             where x.appointment_id = a.id and x.employee_id = p_employee) then
    return;
  end if;
  perform public.lock_day(a.service_date);
  perform public.lock_person(p_employee);
  if public.person_conflicts(p_employee, a.service_date, a.start_min, a.duration_min, a.location_type, a.id) then
    perform public.fail('slot_unavailable', 'That person already has as many jobs as they can take at that time.', 'employee');
  end if;
  insert into public.appointment_assignments (appointment_id, employee_id, assigned_by)
  values (a.id, p_employee, auth.uid());
  update public.job_requests r
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where r.appointment_id = a.id and r.employee_id = p_employee and r.status = 'open';
end
$$;

create function public.unassign_employee(p_appointment uuid, p_employee uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.assert_manager();
  perform public.booking_for_update(p_appointment);
  delete from public.appointment_assignments x
   where x.appointment_id = p_appointment and x.employee_id = p_employee;
  if not found then
    perform public.fail('not_found', 'That person isn''t assigned to this job.');
  end if;
end
$$;

-- Approve (assigns the person) or decline a request to take a job.
create function public.decide_job_request(p_request uuid, p_approve boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r public.job_requests;
begin
  perform public.assert_manager();
  select * into r from public.job_requests x where x.id = p_request;
  if not found then
    perform public.fail('not_found', 'That request wasn''t found.');
  end if;
  -- The booking first, then the request: the same order as assign_employee.
  perform public.booking_for_update(r.appointment_id);
  select * into r from public.job_requests x where x.id = p_request for update;
  if r.status <> 'open' then
    perform public.fail('wrong_state', 'That request has already been answered.');
  end if;
  if coalesce(p_approve, false) then
    perform public.assign_employee(r.appointment_id, r.employee_id);
  else
    update public.job_requests x
       set status = 'declined', decided_by = auth.uid(), decided_at = now()
     where x.id = r.id;
  end if;
end
$$;

-- Answer a review request. Requests addressed to the admin are answered by
-- the admin only.
create function public.resolve_review(p_review uuid, p_resolution text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r public.review_requests;
  v text := nullif(btrim(coalesce(p_resolution, '')), '');
begin
  perform public.assert_manager();
  select * into r from public.review_requests x where x.id = p_review for update;
  if not found then
    perform public.fail('not_found', 'That review request wasn''t found.');
  end if;
  if r.for_admin and not public.is_admin() then
    perform public.fail('not_allowed', 'Only the admin can answer this review request.');
  end if;
  if r.status <> 'open' then
    perform public.fail('wrong_state', 'That review request has already been answered.');
  end if;
  if v is not null and (char_length(v) > 1000 or not public.is_clean_text(v)) then
    perform public.fail('invalid_input', 'Keep the answer under 1,000 characters, with no links.', 'resolution');
  end if;
  update public.review_requests x
     set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution = v
   where x.id = r.id;
end
$$;


-- A booking entered by a manager or the admin for a customer who called
-- (round 8: managers and the admin only, not detailers). The same price,
-- service-area and time rules as online requests apply, under the same day
-- lock; staff may choose any future day within opening hours. Contact
-- details are taken as told on the phone, or from an existing customer
-- account that staff pick (customer_id), which then shows the booking under
-- "My bookings". A booking with a complete price is saved as confirmed; one
-- whose price waits for the extra cost (XL, heavy stains, unpriced sealant)
-- is saved as a request until the admin sets it. Only the admin may include
-- the extra cost.
--
-- Input (JSON): request_id (required), customer_id | (contact_first, contact_last,
-- contact_phone, contact_email), vehicle_id (that customer's saved vehicle) |
-- the vehicle fields as for submit_booking, choices, notes, location_type,
-- address, address_zip, services, service_date, start_min, and, for the admin
-- only, extra_cost_cents and extra_cost_note.
create function public.staff_create_booking(p jsonb) returns public.appointments
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
    if prof.phone is null then
      perform public.fail('invalid_input', 'That account has no confirmed phone number. Enter the contact details instead.', 'customer_id');
    end if;
    if nullif(btrim(coalesce(p ->> 'contact_phone', '')), '') is not null
       and public.normalize_phone(p ->> 'contact_phone') is distinct from prof.phone then
      perform public.fail('invalid_input', 'That phone number doesn''t match the account. Check that this is the right customer.', 'contact_phone');
    end if;
    r.contact_first := coalesce(prof.first_name, nullif(btrim(p ->> 'contact_first'), ''));
    r.contact_last := coalesce(prof.last_name, nullif(btrim(p ->> 'contact_last'), ''));
    r.contact_phone := prof.phone;
    r.contact_email := prof.email;
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

-- ---------------------------------------------------------------------
-- The admin only
-- ---------------------------------------------------------------------

-- Cancel a booking, confirmed or not (Section 11: the admin only).
create function public.cancel_booking(p_id uuid, p_note text default null) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_admin();
  a := public.booking_for_update(p_id);
  if a.status not in ('requested', 'needs_information', 'confirmed', 'in_progress') then
    perform public.fail('wrong_state', 'This booking is already closed.');
  end if;
  perform public.set_action_note(p_note);
  update public.appointments x
     set status = 'cancelled', hold_expires_at = null
   where x.id = a.id
  returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;

-- The extra cost for a larger vehicle, stains or anything else seen on the
-- car (decided Oct 3: the admin only). Setting it releases the price, and
-- the customer is told at once with the new total. The note is shown to the
-- customer.
create function public.set_extra_cost(p_id uuid, p_cents int, p_note text default null)
returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.assert_admin();
  a := public.booking_for_update(p_id);
  if a.status not in ('requested', 'needs_information', 'confirmed', 'in_progress') then
    perform public.fail('wrong_state', 'This booking is already closed.');
  end if;
  if p_cents is null or p_cents < 0 or p_cents > 1000000 then
    perform public.fail('invalid_input', 'Enter an amount between $0 and $10,000.', 'extra_cost_cents');
  end if;
  if v is not null and (char_length(v) > 500 or not public.is_clean_text(v)) then
    perform public.fail('invalid_input', 'Keep the note under 500 characters, with no links.', 'note');
  end if;
  update public.appointments x
     set extra_cost_cents = p_cents,
         extra_cost_note = v,
         price_pending = false,
         pending_reasons = '{}'
   where x.id = a.id
  returning * into a;
  return a;
end
$$;

-- Change someone's role. The last active admin can't be demoted.
create function public.set_user_role(p_user uuid, p_role public.user_role) returns public.profiles
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r public.profiles;
begin
  perform public.assert_admin();
  -- One role change at a time, so two admins can't remove each other at once.
  perform pg_catalog.pg_advisory_xact_lock(7304, 0);
  if p_role is null then
    perform public.fail('invalid_input', 'Choose a role.', 'role');
  end if;
  select * into r from public.profiles x where x.id = p_user for update;
  if not found or r.deleted_at is not null then
    perform public.fail('not_found', 'That account wasn''t found.');
  end if;
  if r.role = 'admin' and p_role <> 'admin' and not exists (
       select 1 from public.profiles x
       where x.role = 'admin' and x.is_active and x.deleted_at is null and x.id <> r.id) then
    perform public.fail('wrong_state', 'There must always be at least one admin.');
  end if;
  update public.profiles x set role = p_role where x.id = r.id returning * into r;
  return r;
end
$$;

-- Turn an account off or on. Off takes effect at once: every role check
-- requires an active account. Nobody can turn off their own account or the
-- last admin.
create function public.set_user_active(p_user uuid, p_active boolean) returns public.profiles
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r public.profiles;
begin
  perform public.assert_admin();
  perform pg_catalog.pg_advisory_xact_lock(7304, 0);
  if p_active is null then
    perform public.fail('invalid_input', 'Choose on or off.', 'active');
  end if;
  select * into r from public.profiles x where x.id = p_user for update;
  if not found or r.deleted_at is not null then
    perform public.fail('not_found', 'That account wasn''t found.');
  end if;
  if not p_active and r.id = auth.uid() then
    perform public.fail('wrong_state', 'You can''t turn off your own account.');
  end if;
  if not p_active and r.role = 'admin' and not exists (
       select 1 from public.profiles x
       where x.role = 'admin' and x.is_active and x.deleted_at is null and x.id <> r.id) then
    perform public.fail('wrong_state', 'There must always be at least one active admin.');
  end if;
  update public.profiles x set is_active = p_active where x.id = r.id returning * into r;
  return r;
end
$$;

-- Clears the personal details from one booking and from everything that
-- quotes it (staff notes, job and review request text, notices), keeping the
-- business record: services, prices, dates and status (D-12).
create function public.scrub_booking(p_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.appointment_events e
     set note = null
   where e.appointment_id = p_id and e.note is not null;
  update public.job_requests jr
     set message = null
   where jr.appointment_id = p_id and jr.message is not null;
  update public.review_requests rr
     set message = '(removed)', resolution = null
   where rr.appointment_id = p_id and (rr.message <> '(removed)' or rr.resolution is not null);
  update public.notifications n
     set body = null
   where n.appointment_id = p_id and n.body is not null;
  update public.appointments x
     set contact_first = null, contact_last = null, contact_phone = null, contact_email = null,
         address = null, vehicle_description = null, damage_note = null, special_request = null,
         extra_cost_note = null, photo_paths = '{}', anonymized_at = coalesce(x.anonymized_at, now())
   where x.id = p_id;
end
$$;

-- Remove a customer's personal details while keeping business records
-- (D-12, F-55). Bookings keep their services, prices, dates and status; their
-- contact details, address, every free-text note about them and photo links are cleared
-- (unlinked photos are then removed by the scheduled cleanup). Saved vehicles
-- are removed from the list. Open bookings must be closed first. The login
-- itself is removed afterwards, from the Supabase dashboard or a server
-- function. Team accounts are turned off instead, never deleted.
create function public.anonymize_customer(p_user uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r public.profiles;
  v_booking uuid;
begin
  perform public.assert_admin();
  select * into r from public.profiles x where x.id = p_user for update;
  if not found or r.deleted_at is not null then
    perform public.fail('not_found', 'That account wasn''t found.');
  end if;
  if r.role <> 'customer' then
    perform public.fail('wrong_state', 'Team accounts are turned off, not deleted. Change the role to customer first.');
  end if;
  if exists (select 1 from public.appointments x
             where x.customer_id = p_user
               and x.status in ('requested', 'needs_information', 'confirmed', 'in_progress')) then
    perform public.fail('wrong_state', 'This customer has open bookings. Decline, cancel or complete them first.');
  end if;
  update public.profiles x
     set first_name = null, last_name = null, phone = null, email = null,
         is_active = false, deleted_at = now()
   where x.id = p_user;
  update public.vehicles v
     set deleted_at = coalesce(v.deleted_at, now())
   where v.owner_id = p_user and v.deleted_at is null;
  for v_booking in
    select x.id from public.appointments x where x.customer_id = p_user
  loop
    perform public.scrub_booking(v_booking);
  end loop;
  delete from public.notifications n where n.recipient_id = p_user;
end
$$;

-- Removes the personal details from one closed booking, for example a
-- booking entered for someone who called and has no account (D-12). The
-- booking keeps its services, prices, dates and status.
create function public.anonymize_booking(p_id uuid) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  perform public.assert_admin();
  a := public.booking_for_update(p_id);
  if a.status in ('requested', 'needs_information', 'confirmed', 'in_progress') then
    perform public.fail('wrong_state', 'Close the booking first: decline, cancel or complete it.');
  end if;
  perform public.scrub_booking(a.id);
  select * into a from public.appointments x where x.id = p_id;
  return a;
end
$$;

-- ---------------------------------------------------------------------
-- Any team member
-- ---------------------------------------------------------------------

-- Open jobs: confirmed, nobody assigned yet, today or later. No customer
-- contact details, street address, photos or free-text notes (Section 11).
create function public.open_jobs(p_days int default 14)
returns table (
  id uuid, ref text, service_date date, start_min int, duration_min int, end_min int,
  location_type public.location_type, area text, vehicle text, vehicle_type text,
  vehicle_size public.vehicle_size, modifications text[], conditions text[], stains text[],
  services text[], requested_by_me boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.assert_staff();
  return query
    select a.id, a.ref, a.service_date, a.start_min, a.duration_min, a.end_min, a.location_type,
           case when a.location_type = 'mobile'
                then coalesce(z.place || ' ', '') || a.address_zip
                else 'Driveway' end,
           case when a.vehicle_not_sure then 'Not sure'
                else concat_ws(' ', a.vehicle_year::text, a.vehicle_make, a.vehicle_model,
                               case when a.vehicle_color is not null then '(' || a.vehicle_color || ')' end) end,
           a.vehicle_type, a.vehicle_size, a.modifications, a.conditions, a.stains,
           array(select i.name from public.appointment_items i where i.appointment_id = a.id order by i.sort),
           exists (select 1 from public.job_requests r
                   where r.appointment_id = a.id and r.employee_id = auth.uid() and r.status = 'open')
    from public.appointments a
    left join public.service_zip_codes z on z.zip = a.address_zip
    where a.status = 'confirmed'
      and a.service_date between public.local_today() and public.local_today() + least(greatest(coalesce(p_days, 14), 1), 60)
      and not exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id)
    order by a.service_date, a.start_min;
end
$$;

-- Ask to take an open job. A manager or the admin decides.
create function public.request_job(p_appointment uuid, p_message text default null) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v text := nullif(btrim(coalesce(p_message, '')), '');
  rid uuid;
begin
  perform public.assert_staff();
  select * into a from public.appointments x where x.id = p_appointment;
  if not found or a.status <> 'confirmed' or a.service_date < public.local_today()
     or exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id) then
    perform public.fail('wrong_state', 'This job isn''t open.');
  end if;
  if v is not null and (char_length(v) > 500 or not public.is_clean_text(v)) then
    perform public.fail('invalid_input', 'Keep the message under 500 characters, with no links.', 'message');
  end if;
  begin
    insert into public.job_requests (appointment_id, employee_id, message)
    values (a.id, auth.uid(), v)
    returning id into rid;
  exception when unique_violation then
    perform public.fail('wrong_state', 'You''ve already asked for this job.');
  end;
  return rid;
end
$$;

create function public.withdraw_job_request(p_request uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  update public.job_requests r
     set status = 'withdrawn'
   where r.id = p_request and r.employee_id = auth.uid() and r.status = 'open';
  if not found then
    perform public.fail('not_found', 'That open request wasn''t found.');
  end if;
end
$$;

-- Ask a manager, or the admin, to review a booking. Team members can ask
-- about jobs assigned to them and open jobs; managers about any booking.
create function public.request_review(p_appointment uuid, p_message text, p_for_admin boolean default false)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v text := nullif(btrim(coalesce(p_message, '')), '');
  rid uuid;
begin
  perform public.assert_staff();
  select * into a from public.appointments x where x.id = p_appointment;
  if not found or not (
       public.is_manager()
    or public.is_assigned(a.id)
    or (a.status = 'confirmed' and a.service_date >= public.local_today()
        and not exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id))) then
    perform public.fail('not_found', 'That booking wasn''t found.');
  end if;
  if v is null or char_length(v) > 1000 or not public.is_clean_text(v) then
    perform public.fail('invalid_input', 'Write a short message (under 1,000 characters, no links).', 'message');
  end if;
  insert into public.review_requests (appointment_id, requested_by, for_admin, message)
  values (a.id, auth.uid(), coalesce(p_for_admin, false), v)
  returning id into rid;
  return rid;
end
$$;

-- ---------------------------------------------------------------------
-- Server-side only (never callable from the website)
-- ---------------------------------------------------------------------

-- One-time owner setup: after signing up on the site with a confirmed
-- phone, run this once from the SQL editor to make that account the admin.
create function public.bootstrap_admin(p_phone text) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(7304, 0);
  if exists (select 1 from public.profiles x where x.role = 'admin' and x.deleted_at is null) then
    perform public.fail('wrong_state', 'An admin already exists. Use set_user_role instead.');
  end if;
  if v_phone is null then
    perform public.fail('invalid_input', 'Enter a US phone number.', 'phone');
  end if;
  select x.id into v_id from public.profiles x where x.phone = v_phone and x.deleted_at is null;
  if v_id is null then
    perform public.fail('not_found', 'No account with that confirmed phone number. Sign up on the site and confirm the text code first.');
  end if;
  update public.profiles x set role = 'admin', is_active = true where x.id = v_id;
  return v_id;
end
$$;

-- Photos never attached to a booking and older than the given age, for the
-- scheduled cleanup function, which deletes them through the Storage API
-- (deleting rows here would leave the files behind).
create function public.list_unattached_vehicle_photos(p_older_than interval default interval '24 hours')
returns table (name text)
language sql stable security definer set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'vehicle-photos'
    and o.created_at < now() - greatest(coalesce(p_older_than, interval '24 hours'), interval '1 hour')
    and not exists (select 1 from public.appointments a where a.photo_paths @> array[o.name])
  order by o.created_at
  limit 1000
$$;
