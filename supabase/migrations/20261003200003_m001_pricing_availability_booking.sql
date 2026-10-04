-- Alchemist Detailing — Migration 001, file 3 of 6: prices, open times, booking
-- Apply in order; see file 1 for the overview and conventions.

-- ---------------------------------------------------------------------
-- Public information for the website. Never includes the owner's address,
-- the triage rules or the booking caps (F-68).
-- ---------------------------------------------------------------------
create function public.get_public_settings() returns jsonb
language sql stable security definer set search_path = ''
as $$
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
    'mobile_note', s.mobile_note)
  from public.business_settings s
  where s.id = 1
$$;

-- A JSON array of strings as a clean text array: trimmed, no blanks, no repeats.
create function public.json_text_array(j jsonb) returns text[]
language sql immutable set search_path = ''
as $$
  select case
           when jsonb_typeof(j) = 'array' then coalesce(
             (select array_agg(distinct left(btrim(x), 200))
              from jsonb_array_elements_text(j) as x
              where btrim(x) <> ''),
             '{}')
           else '{}'
         end
$$;

-- Every code must be an active choice on that list.
create function public.options_valid(p_list text, p_codes text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from unnest(coalesce(p_codes, '{}')) as c(code)
    where not exists (
      select 1 from public.form_options o
      where o.list = p_list and o.code = c.code and o.active))
$$;

-- ---------------------------------------------------------------------
-- Prices. The one place a price is worked out, for the screen and for the
-- booking alike, in whole cents (fixes F-64; services by code, F-65).
--
-- Input:  {location_type: "mobile" | "shop",
--          bundle: code | exterior: code, interior: code,
--          addons: [codes], vehicle_type: code, vehicle_size: "standard" | "xl",
--          not_sure: bool, stains: [codes]}
-- Output: {lines: [{code, name, kind, price_cents, mobile_cents, duration_min, included}],
--          value_cents, bundle_savings_cents, subtotal_cents, mobile_cents,
--          price_pending, pending_reasons, total_cents, duration_min}
--
-- Rules decided Oct 3:
--   * a bundle replaces its two parts at the bundle price;
--   * mobile adds each line's percentage (2.5% or 7%), rounded to the cent;
--     "Come to us" adds nothing;
--   * add-ons can't be booked alone; the sealant needs an exterior service;
--   * Interior Deluxe includes steam, shown as Included at $0;
--   * XL vehicles, stains that hold the price, and a sealant on a vehicle with no
--     sealant price get no total until the owner sets the extra cost;
--   * when the chosen exterior and interior services make up a bundle that
--     costs less, the quote recommends it (round 8: recommend, never switch):
--     suggestion = {bundle, name, saves_cents, total_cents, duration_min}.
-- ---------------------------------------------------------------------
create function public.quote_booking(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_loc text := p ->> 'location_type';
  v_bundle text := nullif(btrim(p ->> 'bundle'), '');
  v_ext text := nullif(btrim(p ->> 'exterior'), '');
  v_int text := nullif(btrim(p ->> 'interior'), '');
  v_addons text[] := public.json_text_array(p -> 'addons');
  v_type text := nullif(btrim(p ->> 'vehicle_type'), '');
  v_size text := coalesce(nullif(btrim(p ->> 'vehicle_size'), ''), 'standard');
  v_not_sure boolean := coalesce(p ->> 'not_sure', 'false') = 'true';
  v_stains text[] := public.json_text_array(p -> 'stains');
  is_mobile boolean;
  s public.services;
  v_code text;
  v_kind public.service_kind;
  v_needs text;
  mains uuid[] := '{}';
  main_kinds text[] := '{}';
  included_codes text[] := '{}';
  lines jsonb := '[]'::jsonb;
  v_value int := 0;
  v_savings int := 0;
  v_mobile int := 0;
  v_minutes int := 0;
  parts_value int;
  line_price int;
  line_mobile int;
  pending text[] := '{}';
  v_sugg jsonb;
  v_sugg_code text;
  v_sugg_name text;
  q2 jsonb;
  v_here int;
  v_there int;
begin
  if v_loc is null or v_loc not in ('mobile', 'shop') then
    perform public.fail('invalid_input', 'Choose "We come to you" or "Come to us".', 'location_type');
  end if;
  is_mobile := v_loc = 'mobile';

  if v_size not in ('standard', 'xl') then
    perform public.fail('invalid_input', 'Choose Standard or XL for the vehicle size.', 'vehicle_size');
  end if;
  if v_type is not null and not exists (select 1 from public.vehicle_types t where t.code = v_type and t.active) then
    perform public.fail('invalid_input', 'Choose a vehicle type from the list.', 'vehicle_type');
  end if;
  if not public.options_valid('stain', v_stains) then
    perform public.fail('invalid_input', 'Choose stains from the list.', 'stains');
  end if;

  -- Main services: one bundle, or an exterior and/or an interior service.
  if v_bundle is not null then
    if v_ext is not null or v_int is not null then
      perform public.fail('invalid_input', 'Choose a bundle, or exterior and interior services, not both.', 'services');
    end if;
    select * into s from public.services x where x.code = v_bundle and x.kind = 'bundle' and x.active;
    if not found then
      perform public.fail('invalid_input', 'That bundle isn''t available.', 'bundle');
    end if;
    if s.duration_min is null then
      perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', 'bundle');
    end if;
    select coalesce(sum(pp.base_price_cents), 0)::int,
           coalesce(array_agg(pp.id), '{}'),
           coalesce(array_agg(pp.kind::text), '{}')
      into parts_value, mains, main_kinds
    from public.bundle_parts bp
    join public.services pp on pp.id = bp.part_id
    where bp.bundle_id = s.id;
    if cardinality(mains) = 0 then
      perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', 'bundle');
    end if;
    mains := mains || s.id;
    main_kinds := main_kinds || 'bundle'::text;
    line_mobile := case when is_mobile then round(s.base_price_cents * s.mobile_pct / 100.0)::int else 0 end;
    lines := lines || jsonb_build_object(
      'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', s.base_price_cents,
      'mobile_cents', line_mobile, 'duration_min', s.duration_min, 'included', false);
    v_value := v_value + greatest(parts_value, s.base_price_cents);
    v_savings := v_savings + greatest(parts_value - s.base_price_cents, 0);
    v_mobile := v_mobile + line_mobile;
    v_minutes := v_minutes + s.duration_min;
  else
    for slot in 1 .. 2 loop
      v_code := case slot when 1 then v_ext else v_int end;
      v_kind := case slot when 1 then 'exterior'::public.service_kind else 'interior'::public.service_kind end;
      continue when v_code is null;
      select * into s from public.services x where x.code = v_code and x.kind = v_kind and x.active;
      if not found then
        perform public.fail('invalid_input', 'That ' || v_kind::text || ' service isn''t available.', v_kind::text);
      end if;
      if s.duration_min is null then
        perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', v_kind::text);
      end if;
      line_mobile := case when is_mobile then round(s.base_price_cents * s.mobile_pct / 100.0)::int else 0 end;
      lines := lines || jsonb_build_object(
        'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', s.base_price_cents,
        'mobile_cents', line_mobile, 'duration_min', s.duration_min, 'included', false);
      mains := mains || s.id;
      main_kinds := main_kinds || s.kind::text;
      v_value := v_value + s.base_price_cents;
      v_mobile := v_mobile + line_mobile;
      v_minutes := v_minutes + s.duration_min;
    end loop;
  end if;

  if cardinality(mains) = 0 then
    perform public.fail('invalid_input', 'Choose at least one service. Add-ons can''t be booked on their own.', 'services');
  end if;

  -- Add-ons already part of a chosen service: shown as Included, never charged twice.
  for s in
    select distinct i.*
    from public.service_includes si
    join public.services i on i.id = si.included_id
    where si.service_id = any (mains) and i.active
    order by i.sort
  loop
    included_codes := included_codes || s.code;
    lines := lines || jsonb_build_object(
      'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', 0,
      'mobile_cents', 0, 'duration_min', 0, 'included', true);
  end loop;

  -- Chosen add-ons.
  foreach v_code in array v_addons loop
    continue when v_code = any (included_codes);
    select * into s from public.services x where x.code = v_code and x.kind = 'addon' and x.active;
    if not found then
      perform public.fail('invalid_input', 'That add-on isn''t available.', 'addons');
    end if;
    if s.duration_min is null then
      perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', 'addons');
    end if;
    select coalesce((select r.needs from public.addon_rules r where r.addon_id = s.id), 'any_main') into v_needs;
    if v_needs in ('exterior', 'interior') and not (v_needs = any (main_kinds)) then
      perform public.fail('invalid_input', s.name || ' needs an ' || v_needs || ' service in the same booking.', 'addons');
    end if;
    if s.priced_by_vehicle_type then
      line_price := null;
      if not v_not_sure and v_type is not null then
        select tp.price_cents into line_price
        from public.service_type_prices tp
        where tp.service_id = s.id and tp.vehicle_type = v_type;
      end if;
      if line_price is null then
        pending := pending || 'vehicle_price'::text;
      end if;
    else
      line_price := s.base_price_cents;
    end if;
    line_mobile := case when is_mobile and line_price is not null
                        then round(line_price * s.mobile_pct / 100.0)::int else 0 end;
    lines := lines || jsonb_build_object(
      'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', line_price,
      'mobile_cents', line_mobile, 'duration_min', s.duration_min, 'included', false);
    v_value := v_value + coalesce(line_price, 0);
    v_mobile := v_mobile + line_mobile;
    v_minutes := v_minutes + s.duration_min;
  end loop;

  -- What holds the price until the owner sets the extra cost.
  if v_size = 'xl' then
    pending := pending || 'xl'::text;
  end if;
  if exists (select 1 from public.form_options o where o.list = 'stain' and o.holds_price and o.code = any (v_stains)) then
    pending := pending || 'stains'::text;
  end if;
  pending := array(select distinct x from unnest(pending) as x order by 1);

  -- A bundle made of exactly the chosen exterior and interior services that
  -- costs less (mobile percentage included) is recommended, never applied.
  if v_bundle is null and v_ext is not null and v_int is not null then
    v_here := v_value - v_savings + v_mobile;
    for v_sugg_code, v_sugg_name in
      select b.code, b.name
      from public.services b
      where b.kind = 'bundle' and b.active and b.duration_min is not null
        and array(select x.code from public.bundle_parts bp join public.services x on x.id = bp.part_id
                  where bp.bundle_id = b.id order by x.code)
            = array(select c from unnest(array[v_ext, v_int]) as c order by c)
      order by b.sort
    loop
      begin
        q2 := public.quote_booking((p - 'exterior' - 'interior') || jsonb_build_object('bundle', v_sugg_code));
        v_there := (q2 ->> 'value_cents')::int - (q2 ->> 'bundle_savings_cents')::int + (q2 ->> 'mobile_cents')::int;
        -- The bundle that saves the most wins.
        if v_there < v_here and (v_sugg is null or v_here - v_there > (v_sugg ->> 'saves_cents')::int) then
          v_sugg := jsonb_build_object('bundle', v_sugg_code, 'name', v_sugg_name, 'saves_cents', v_here - v_there,
                                       'total_cents', q2 -> 'total_cents', 'duration_min', q2 -> 'duration_min');
        end if;
      exception when others then
        null;
      end;
    end loop;
  end if;

  return jsonb_build_object(
    'location_type', v_loc,
    'lines', lines,
    'value_cents', v_value,
    'bundle_savings_cents', v_savings,
    'subtotal_cents', v_value - v_savings,
    'mobile_cents', v_mobile,
    'price_pending', cardinality(pending) > 0,
    'pending_reasons', to_jsonb(pending),
    'total_cents', case when cardinality(pending) > 0 then null else v_value - v_savings + v_mobile end,
    'duration_min', v_minutes,
    'suggestion', v_sugg);
end
$$;


-- ---------------------------------------------------------------------
-- Availability (decided Oct 3): every day, starts from 10 AM to 7 PM every
-- 30 minutes, no job past 8 PM, 1 to 60 days ahead, 2 driveway jobs or 1
-- mobile job at a time and never both, buffers between jobs.
-- A new request holds its time for 24 hours; a confirmed job holds it for good.
-- ---------------------------------------------------------------------
create function public.holds_time(p_status public.appointment_status, p_queue public.intake_queue, p_hold timestamptz)
returns boolean
language sql stable set search_path = ''
as $$
  select p_status in ('confirmed', 'in_progress')
      or (p_status in ('requested', 'needs_information') and p_queue <> 'spam' and p_hold > now())
$$;

create function public.local_today() returns date
language sql stable security definer set search_path = ''
as $$
  select (now() at time zone s.timezone)::date from public.business_settings s where s.id = 1
$$;

create function public.local_minute_now() returns int
language sql stable security definer set search_path = ''
as $$
  select (extract(hour from now() at time zone s.timezone) * 60
        + extract(minute from now() at time zone s.timezone))::int
  from public.business_settings s where s.id = 1
$$;

-- Every open start time in a range of days, worked out in one query (F-24).
-- The single source of truth for open times: the calendar, the time list and
-- every booking path use it, so what the customer sees is what the database
-- accepts.
--
-- A time is open when the job fits the opening hours, the day isn't closed,
-- it isn't in the past, it's inside the booking window (staff may book any
-- future day), and at every moment of the job, buffer included, the driveway
-- or mobile limit still has room and the other kind isn't running while
-- "both at once" is off. The busiest moment is always the job's own start or
-- the start of another job inside it, so only those moments are checked.
create function public.open_starts(p_from date, p_days int, p_duration int, p_loc public.location_type,
                                   p_exclude uuid default null, p_staff boolean default false)
returns table (day date, start_min int)
language sql stable security definer set search_path = ''
as $$
  with st as (
    select s.*,
           (now() at time zone s.timezone)::date as today,
           (extract(hour from now() at time zone s.timezone) * 60
            + extract(minute from now() at time zone s.timezone))::int as minute_now,
           case when p_loc = 'mobile' then s.max_mobile_jobs else s.max_shop_jobs end as cap,
           case when p_loc = 'mobile' then s.mobile_buffer_min else s.shop_buffer_min end as own_buffer,
           least(greatest(coalesce(p_days, 1), 1), 62) as n_days
    from public.business_settings s
    where s.id = 1
  ),
  days as (
    select (p_from + g)::date as day
    from st, generate_series(0, st.n_days - 1) as g
    where p_from is not null and p_loc is not null and p_duration between 5 and 720
  ),
  cand as (
    select d.day, m as start_min, m + p_duration + st.own_buffer as c_end
    from st
    cross join days d
    cross join lateral generate_series(st.first_start_min, st.last_start_min, st.slot_step_min) as m
    where m + p_duration <= st.latest_end_min
      and (d.day > st.today or (d.day = st.today and m > st.minute_now))
      and (p_staff or d.day between st.today + st.min_days_ahead and st.today + st.max_days_ahead)
      and not exists (select 1 from public.blocked_days b where b.day = d.day)
  ),
  busy as (
    select a.service_date, a.start_min, a.location_type,
           a.end_min + case when a.location_type = 'mobile' then st.mobile_buffer_min else st.shop_buffer_min end as b_end
    from st
    join public.appointments a
      on a.service_date >= p_from and a.service_date < p_from + st.n_days
    where a.id is distinct from p_exclude
      and public.holds_time(a.status, a.queue, a.hold_expires_at)
  )
  select c.day, c.start_min
  from cand c
  cross join st
  where not exists (
    select 1
    from (select c.start_min as t
          union
          select b.start_min
          from busy b
          where b.service_date = c.day and b.start_min > c.start_min and b.start_min < c.c_end) as pts
    where (select count(*) from busy b
           where b.service_date = c.day and b.location_type = p_loc
             and b.start_min <= pts.t and b.b_end > pts.t) >= st.cap
       or (not st.shop_and_mobile_together
           and exists (select 1 from busy b
                       where b.service_date = c.day and b.location_type <> p_loc
                         and b.start_min <= pts.t and b.b_end > pts.t)))
  order by c.day, c.start_min
$$;

-- Can this job start then? Used under the day lock by every booking path.
create function public.slot_is_bookable(p_date date, p_start int, p_duration int, p_loc public.location_type,
                                        p_exclude uuid default null, p_staff boolean default false)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_start is not null
     and exists (select 1
                 from public.open_starts(p_date, 1, p_duration, p_loc, p_exclude, p_staff) o
                 where o.start_min = p_start)
$$;

-- Open start times (minutes after midnight) for a job of this length.
create function public.get_availability(p_date date, p_duration int, p_location text default 'mobile')
returns int[]
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_location is null or p_location not in ('mobile', 'shop') then
    perform public.fail('invalid_input', 'Choose "We come to you" or "Come to us".', 'location_type');
  end if;
  return coalesce(
    (select array_agg(o.start_min order by o.start_min)
     from public.open_starts(p_date, 1, p_duration, p_location::public.location_type) o),
    '{}');
end
$$;

-- One row per day: is there at least one open start time? (up to 62 days)
create function public.get_calendar(p_from date, p_days int, p_duration int, p_location text default 'mobile')
returns table (day date, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  n int := least(greatest(coalesce(p_days, 1), 1), 62);
begin
  if p_location is null or p_location not in ('mobile', 'shop') then
    perform public.fail('invalid_input', 'Choose "We come to you" or "Come to us".', 'location_type');
  end if;
  if p_from is null then
    return;
  end if;
  return query
    with open_days as (
      select distinct o.day as d
      from public.open_starts(p_from, n, p_duration, p_location::public.location_type) o
    )
    select (p_from + g)::date, exists (select 1 from open_days x where x.d = (p_from + g)::date)
    from generate_series(0, n - 1) as g
    order by 1;
end
$$;

-- Locks used by every path that adds or moves time on the calendar, so two
-- changes to the same day run one after the other (F-20). Always taken in
-- this order: customer, then days in date order, then team members.
create function public.lock_customer(p_user uuid) returns void
language sql volatile set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(7301, pg_catalog.hashtext(p_user::text))
$$;

create function public.lock_day(p_date date) returns void
language sql volatile set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(7302, p_date - date '2000-01-01')
$$;

create function public.lock_person(p_user uuid) returns void
language sql volatile set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(7303, pg_catalog.hashtext(p_user::text))
$$;

-- Would this team member be over their limit? One person can work up to 2
-- driveway cars at once, or 1 mobile job, never both (decided Oct 3). Counts
-- confirmed and in-progress jobs they are assigned to; buffers apply.
create function public.person_conflicts(p_employee uuid, p_date date, p_start int, p_duration int,
                                        p_loc public.location_type, p_exclude uuid default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with st as (
    select s.*,
           case when p_loc = 'mobile' then s.max_mobile_jobs_per_person else s.max_shop_jobs_per_person end as cap,
           p_start + p_duration
             + case when p_loc = 'mobile' then s.mobile_buffer_min else s.shop_buffer_min end as c_end
    from public.business_settings s
    where s.id = 1
  ),
  busy as (
    select a.start_min, a.location_type,
           a.end_min + case when a.location_type = 'mobile' then st.mobile_buffer_min else st.shop_buffer_min end as b_end
    from st
    join public.appointments a on a.service_date = p_date
    join public.appointment_assignments x on x.appointment_id = a.id and x.employee_id = p_employee
    where a.id is distinct from p_exclude
      and a.status in ('confirmed', 'in_progress')
  )
  select exists (
    select 1
    from st,
         (select p_start as t
          union
          select b.start_min from busy b, st where b.start_min > p_start and b.start_min < st.c_end) as pts
    where (select count(*) from busy b
           where b.location_type = p_loc and b.start_min <= pts.t and b.b_end > pts.t) >= st.cap
       or exists (select 1 from busy b
                  where b.location_type <> p_loc and b.start_min <= pts.t and b.b_end > pts.t))
$$;

-- ---------------------------------------------------------------------
-- What a customer sees of a booking. Never the lane, the review reasons or
-- staff notes (F-50). A booking in Spam looks like any other request.
-- ---------------------------------------------------------------------
create function public.booking_receipt(a public.appointments) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'ref', a.ref,
    'status', a.status,
    'service_date', a.service_date,
    'start_min', a.start_min,
    'duration_min', a.duration_min,
    'end_min', a.end_min,
    'location_type', a.location_type,
    'address', a.address,
    'address_zip', a.address_zip,
    'hold_expires_at', case when a.status in ('requested', 'needs_information')
                            then coalesce(a.hold_expires_at, a.created_at + make_interval(hours => s.hold_hours)) end,
    'vehicle', jsonb_build_object(
      'make', a.vehicle_make, 'model', a.vehicle_model, 'year', a.vehicle_year, 'color', a.vehicle_color,
      'type', a.vehicle_type, 'size', a.vehicle_size, 'not_sure', a.vehicle_not_sure,
      'description', a.vehicle_description),
    'value_cents', a.value_cents,
    'bundle_savings_cents', a.bundle_savings_cents,
    'mobile_cents', a.mobile_cents,
    'extra_cost_cents', a.extra_cost_cents,
    'extra_cost_note', a.extra_cost_note,
    'price_pending', a.price_pending,
    'pending_reasons', to_jsonb(a.pending_reasons),
    'total_cents', a.total_cents,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', i.code, 'name', i.name, 'kind', i.kind, 'price_cents', i.price_cents,
               'mobile_cents', i.mobile_cents, 'duration_min', i.duration_min, 'included', i.included)
             order by i.sort)
      from public.appointment_items i
      where i.appointment_id = a.id), '[]'::jsonb),
    'created_at', a.created_at)
  from public.business_settings s
  where s.id = 1
$$;

-- A photo's storage name: <login ID>/<random ID>.<jpg|jpeg|png|webp>.
create function public.is_vehicle_photo_name(p_name text, p_owner uuid) returns boolean
language sql immutable set search_path = ''
as $$
  select p_name is not null and p_owner is not null
     and p_name ~ ('^' || p_owner::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$')
$$;

-- ---------------------------------------------------------------------
-- The parts of a booking that every booking path checks the same way, so a
-- customer's request and a booking entered by staff follow identical rules:
-- the vehicle, the form's choices and notes, the location and service area,
-- the price and length (from quote_booking), and the day and start time.
-- ---------------------------------------------------------------------
create type public.booking_details as (
  vehicle_id uuid,
  vehicle_make text,
  vehicle_model text,
  vehicle_year int,
  vehicle_color text,
  vehicle_type text,
  vehicle_size public.vehicle_size,
  vehicle_not_sure boolean,
  vehicle_description text,
  modifications text[],
  conditions text[],
  stains text[],
  damage text[],
  damage_note text,
  special_request text,
  location_type public.location_type,
  address text,
  address_zip text,
  quote jsonb,
  codes text[],
  service_date date,
  start_min int,
  duration_min int,
  review_reasons text[]
);

-- p_owner: whose saved vehicles may be used (the customer), or null.
create function public.read_booking_details(p jsonb, p_owner uuid) returns public.booking_details
language plpgsql stable security definer set search_path = ''
as $$
declare
  st public.business_settings;
  d public.booking_details;
  veh public.vehicles;
  v_size text;
begin
  select * into st from public.business_settings where id = 1;

  -- The vehicle: a saved one, or as typed, or "Not sure" with a description.
  d.vehicle_not_sure := false;
  d.vehicle_id := public.try_uuid(p ->> 'vehicle_id');
  if nullif(btrim(p ->> 'vehicle_id'), '') is not null and d.vehicle_id is null then
    perform public.fail('invalid_input', 'Choose one of the saved vehicles.', 'vehicle_id');
  end if;
  if d.vehicle_id is not null then
    select * into veh from public.vehicles x
    where x.id = d.vehicle_id and x.owner_id = p_owner and x.deleted_at is null;
    if not found then
      perform public.fail('not_found', 'That saved vehicle wasn''t found.', 'vehicle_id');
    end if;
    d.vehicle_make := veh.make;
    d.vehicle_model := veh.model;
    d.vehicle_year := veh.year;
    d.vehicle_color := veh.color;
    d.vehicle_type := veh.vehicle_type;
    v_size := veh.size::text;
    d.modifications := veh.modifications;
  else
    d.vehicle_not_sure := coalesce(p ->> 'not_sure', 'false') = 'true';
    d.vehicle_type := nullif(btrim(p ->> 'vehicle_type'), '');
    v_size := coalesce(nullif(btrim(p ->> 'vehicle_size'), ''), 'standard');
    d.modifications := public.json_text_array(p -> 'modifications');
    if d.vehicle_not_sure then
      d.vehicle_description := nullif(btrim(p ->> 'vehicle_description'), '');
      if d.vehicle_description is null or char_length(d.vehicle_description) > 1000
         or not public.is_clean_text(d.vehicle_description) then
        perform public.fail('invalid_input', 'Describe the vehicle in a few words (no links).', 'vehicle_description');
      end if;
    else
      d.vehicle_make := nullif(btrim(p ->> 'vehicle_make'), '');
      d.vehicle_model := nullif(btrim(p ->> 'vehicle_model'), '');
      d.vehicle_color := nullif(btrim(p ->> 'vehicle_color'), '');
      if d.vehicle_make is null or char_length(d.vehicle_make) > 40 or not public.is_clean_text(d.vehicle_make) then
        perform public.fail('invalid_input', 'Enter the vehicle make.', 'vehicle_make');
      end if;
      if d.vehicle_model is null or char_length(d.vehicle_model) > 40 or not public.is_clean_text(d.vehicle_model) then
        perform public.fail('invalid_input', 'Enter the vehicle model.', 'vehicle_model');
      end if;
      if d.vehicle_color is not null and (char_length(d.vehicle_color) > 30 or not public.is_clean_text(d.vehicle_color)) then
        perform public.fail('invalid_input', 'Enter the color in a few letters.', 'vehicle_color');
      end if;
      if nullif(btrim(p ->> 'vehicle_year'), '') is not null then
        d.vehicle_year := public.try_int(btrim(p ->> 'vehicle_year'));
        if d.vehicle_year is null or d.vehicle_year < 1900 or d.vehicle_year > extract(year from now())::int + 2 then
          perform public.fail('invalid_input', 'Enter a 4-digit year.', 'vehicle_year');
        end if;
      end if;
      if d.vehicle_type is null then
        perform public.fail('invalid_input', 'Choose a vehicle type.', 'vehicle_type');
      end if;
    end if;
  end if;

  -- Choices from the form's lists, and the notes.
  d.conditions := public.json_text_array(p -> 'conditions');
  d.stains := public.json_text_array(p -> 'stains');
  d.damage := public.json_text_array(p -> 'damage');
  if not public.options_valid('modification', d.modifications) then
    perform public.fail('invalid_input', 'Choose modifications from the list.', 'modifications');
  end if;
  if not public.options_valid('condition', d.conditions) then
    perform public.fail('invalid_input', 'Choose the vehicle''s condition from the list.', 'conditions');
  end if;
  if not public.options_valid('damage', d.damage) then
    perform public.fail('invalid_input', 'Choose damage from the list.', 'damage');
  end if;
  if cardinality(d.damage) > 1 and exists (
       select 1 from public.form_options o where o.list = 'damage' and o.is_none and o.code = any (d.damage)) then
    perform public.fail('invalid_input', '"No known damage" can''t be combined with other damage.', 'damage');
  end if;
  d.damage_note := nullif(btrim(p ->> 'damage_note'), '');
  if d.damage_note is null and exists (
       select 1 from public.form_options o where o.list = 'damage' and o.requires_note and o.code = any (d.damage)) then
    perform public.fail('invalid_input', 'Describe the damage in a few words.', 'damage_note');
  end if;
  if d.damage_note is not null and (char_length(d.damage_note) > 1000 or not public.is_clean_text(d.damage_note)) then
    perform public.fail('invalid_input', 'Keep the damage description under 1,000 characters, with no links.', 'damage_note');
  end if;
  d.special_request := nullif(btrim(p ->> 'special_request'), '');
  if d.special_request is not null and (char_length(d.special_request) > 1000 or not public.is_clean_text(d.special_request)) then
    perform public.fail('invalid_input', 'Keep the note under 1,000 characters, with no links.', 'special_request');
  end if;

  -- Location first: mobile only inside the service area.
  if p ->> 'location_type' = 'mobile' then
    d.address := nullif(btrim(p ->> 'address'), '');
    if d.address is null or char_length(d.address) > 300 or not public.is_clean_text(d.address) then
      perform public.fail('invalid_input', 'Enter the street address where the vehicle will be.', 'address');
    end if;
    d.address_zip := substring(btrim(coalesce(p ->> 'address_zip', '')) from '^([0-9]{5})(-[0-9]{4})?$');
    if d.address_zip is null then
      perform public.fail('invalid_input', 'Enter a 5-digit ZIP code.', 'address_zip');
    end if;
    if not exists (select 1 from public.service_zip_codes z where z.zip = d.address_zip) then
      perform public.fail('outside_service_area',
        'We come to you within about ' || st.mobile_radius_miles || ' miles of ' || st.public_area
        || '. For other areas, call ' || st.public_phone || '.', 'address_zip');
    end if;
  end if;

  -- Prices and minutes, from the one quote routine.
  d.quote := public.quote_booking(jsonb_build_object(
               'location_type', p ->> 'location_type',
               'bundle', p -> 'bundle',
               'exterior', p -> 'exterior',
               'interior', p -> 'interior',
               'addons', p -> 'addons',
               'vehicle_type', d.vehicle_type,
               'vehicle_size', v_size,
               'not_sure', d.vehicle_not_sure,
               'stains', to_jsonb(d.stains)));
  d.location_type := (d.quote ->> 'location_type')::public.location_type;
  d.vehicle_size := v_size::public.vehicle_size;
  d.duration_min := (d.quote ->> 'duration_min')::int;
  d.codes := array(select l ->> 'code'
                   from jsonb_array_elements(d.quote -> 'lines') as l
                   where not (l ->> 'included')::boolean
                   order by 1);

  -- Day and start time: on the grid, inside opening hours, done by closing.
  d.service_date := public.try_date(p ->> 'service_date');
  if d.service_date is null then
    perform public.fail('invalid_input', 'Choose a day.', 'service_date');
  end if;
  d.start_min := public.try_int(p ->> 'start_min');
  if d.start_min is null or d.start_min < st.first_start_min or d.start_min > st.last_start_min
     or (d.start_min - st.first_start_min) % st.slot_step_min <> 0 then
    perform public.fail('invalid_input', 'Choose one of the start times shown.', 'start_min');
  end if;
  if d.start_min + d.duration_min > st.latest_end_min then
    perform public.fail('slot_unavailable', 'That service doesn''t finish by closing time from that start. Choose an earlier time.', 'start_min');
  end if;

  -- What would send a customer's request to Review: Unknown or Other damage
  -- (D-16) and unclear vehicle details; "Not sure" alone doesn't (D-07).
  d.review_reasons := '{}';
  if public.looks_like_junk(d.vehicle_make)
     or public.model_looks_like_junk(d.vehicle_make, d.vehicle_model)
     or (d.vehicle_not_sure and public.looks_like_junk(d.vehicle_description)) then
    d.review_reasons := d.review_reasons || 'unclear_vehicle'::text;
  end if;
  if exists (select 1 from public.form_options o
             where o.list = 'damage' and o.sends_to_review and o.code = any (d.damage)) then
    d.review_reasons := d.review_reasons || 'damage'::text;
  end if;
  return d;
end
$$;

-- Saves a prepared booking with a random reference (retried on the rare
-- clash) and its price lines from the quote. Money always comes from the quote.
create function public.save_booking(r public.appointments, q jsonb) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_constraint text;
begin
  for attempt in 1 .. 5 loop
    begin
      insert into public.appointments (
        ref, customer_id, request_id,
        contact_first, contact_last, contact_phone, contact_email,
        vehicle_id, vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_type, vehicle_size,
        vehicle_not_sure, vehicle_description,
        modifications, conditions, stains, damage, damage_note, special_request, photo_paths,
        location_type, address, address_zip,
        service_date, start_min, duration_min,
        status, queue, review_reasons, hold_expires_at,
        value_cents, bundle_savings_cents, mobile_cents, price_pending, pending_reasons,
        extra_cost_cents, extra_cost_note, created_by)
      values (
        public.new_booking_ref(), r.customer_id, r.request_id,
        r.contact_first, r.contact_last, r.contact_phone, r.contact_email,
        r.vehicle_id, r.vehicle_make, r.vehicle_model, r.vehicle_year, r.vehicle_color, r.vehicle_type,
        coalesce(r.vehicle_size, 'standard'),
        coalesce(r.vehicle_not_sure, false), r.vehicle_description,
        coalesce(r.modifications, '{}'), coalesce(r.conditions, '{}'), coalesce(r.stains, '{}'),
        coalesce(r.damage, '{}'), r.damage_note, r.special_request, coalesce(r.photo_paths, '{}'),
        r.location_type, r.address, r.address_zip,
        r.service_date, r.start_min, r.duration_min,
        coalesce(r.status, 'requested'), coalesce(r.queue, 'requests'), coalesce(r.review_reasons, '{}'),
        r.hold_expires_at,
        (q ->> 'value_cents')::int, (q ->> 'bundle_savings_cents')::int, (q ->> 'mobile_cents')::int,
        coalesce(r.price_pending, false), coalesce(r.pending_reasons, '{}'),
        r.extra_cost_cents, r.extra_cost_note, r.created_by)
      returning * into a;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'appointments_request_key' then
        perform public.fail('wrong_state', 'This booking was already saved.', 'request_id');
      end if;
      if v_constraint is distinct from 'appointments_ref_key' or attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.appointment_items
    (appointment_id, service_id, code, name, kind, price_cents, mobile_cents, duration_min, included, sort)
  select a.id, s.id, t.l ->> 'code', t.l ->> 'name', (t.l ->> 'kind')::public.service_kind,
         (t.l ->> 'price_cents')::int, (t.l ->> 'mobile_cents')::int, (t.l ->> 'duration_min')::int,
         (t.l ->> 'included')::boolean, t.ord
  from jsonb_array_elements(q -> 'lines') with ordinality as t(l, ord)
  join public.services s on s.code = t.l ->> 'code';
  return a;
end
$$;

-- ---------------------------------------------------------------------
-- Send a booking request (W-06). Only signed-in users whose phone is
-- confirmed by a text code can book, guests included (Section 9). Everything
-- the browser sends is checked again here; prices, minutes, status and lane
-- are decided by the database.
--
-- Input (JSON): request_id, first_name, last_name (used only if the profile
-- has none), vehicle_id | (vehicle_make, vehicle_model, vehicle_year,
-- vehicle_color, vehicle_type, vehicle_size) | (not_sure: true,
-- vehicle_description, optional vehicle_type and vehicle_size),
-- modifications[], conditions[], stains[], damage[], damage_note,
-- special_request, photos[], location_type, address, address_zip, bundle |
-- exterior, interior, addons[], service_date (YYYY-MM-DD), start_min,
-- website (the hidden spam field; must be empty).
-- Output: the receipt (reference, status, times and prices).
-- ---------------------------------------------------------------------
create function public.submit_booking(p jsonb) returns jsonb
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
  v_photos text[];
  v_spam boolean;
  n int;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    perform public.fail('invalid_input', 'The booking details are missing.');
  end if;

  -- 1. A signed-in user whose phone is confirmed.
  if uid is null then
    perform public.fail('sign_in_required', 'Please confirm your phone number to send a booking request.');
  end if;
  select u.phone, u.phone_confirmed_at, coalesce(u.is_anonymous, false) as is_anonymous
    into au
  from auth.users u
  where u.id = uid;
  if not found or au.is_anonymous or au.phone_confirmed_at is null or public.normalize_phone(au.phone) is null then
    perform public.fail('phone_not_verified', 'Confirm your phone number with the text code first.', 'phone');
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

  -- 2. The same request again returns the first booking (F-04).
  if v_request is not null then
    select * into a from public.appointments x where x.customer_id = uid and x.request_id = v_request;
    if found then
      return public.booking_receipt(a) || jsonb_build_object('repeat', true);
    end if;
  end if;

  -- 3. Contact details: the name from the profile, or as typed when the
  -- profile has none (then saved to it). Phone and email come only from
  -- Supabase Auth, once confirmed; typed contact details are never trusted.
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
  r.contact_phone := public.normalize_phone(au.phone);
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
  'Booking request from a signed-in user with a text-confirmed phone. Errors: SQLSTATE P0001, message = code, detail = text to show, hint = field.';
