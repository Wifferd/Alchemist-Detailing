-- Migration 002, part 2: condition fees (doc 24, Oct 5 2026).
-- A mandatory "what's the car like" choice with interior-only fees:
--   Pet hair $15, Excessive dirt / mud / sand $10, Spills / food / light stains $10,
--   Heavy or set-in stains $30 (always charged), Other (owner prices it, Review lane), None.
-- Interior Deluxe and the Full Detail Bundle include the $10 and $15 ones.
-- Fees are services of kind "addon" with codes cond_*, so they flow through the
-- quote, the booking's price lines and the admin screens like any other line.
-- Odor is no longer offered. The old "stain" list stays for history but no
-- longer holds the price. Exterior conditions are not offered: bugs, tar and
-- the like go in the notes, and the owner prices them.

-- 1. A fee adds no minutes: allow 0 (empty still means "not bookable").
alter table public.services drop constraint services_duration_min_check;
alter table public.services add constraint services_duration_min_check
  check (duration_min is null or duration_min between 0 and 720);

-- 2. The fee services.
insert into public.services (code, kind, name, description, base_price_cents, priced_by_vehicle_type, duration_min, mobile_pct, sort) values
  ('cond_pet_hair',     'addon', 'Pet hair',                     'Pet hair removal from seats, carpets and crevices.',        1500, false, 0, 2.5, 110),
  ('cond_dirt_sand',    'addon', 'Excessive dirt, mud or sand',  'Extra time for heavy dirt, mud or sand inside the car.',    1000, false, 0, 2.5, 120),
  ('cond_spills',       'addon', 'Spills or light stains',       'Spills, food or drink, and light stains.',                  1000, false, 0, 2.5, 130),
  ('cond_heavy_stains', 'addon', 'Heavy or set-in stains',       'Grease, oil, ink, mold or mildew, and set-in stains.',     3000, false, 0, 2.5, 140);

-- 3. Fees need an interior service.
insert into public.addon_rules (addon_id, needs)
select s.id, 'interior' from public.services s where s.code like 'cond\_%';

-- 4. Interior Deluxe and the Full Detail Bundle cover the lighter ones (not heavy stains).
insert into public.service_includes (service_id, included_id)
select m.id, f.id
from public.services m, public.services f
where m.code in ('int_deluxe', 'full_detail')
  and f.code in ('cond_pet_hair', 'cond_dirt_sand', 'cond_spills');

-- 5. The condition list: which fee each option carries.
alter table public.form_options add column fee_code text references public.services(code);
update public.form_options set active = false where list = 'condition';
insert into public.form_options (list, code, label, is_none, sends_to_review, holds_price, requires_note, sort, active, fee_code) values
  ('condition', 'none',         'None',                                   true,  false, false, false, 1, true, null),
  ('condition', 'dirt_sand',    'Excessive dirt, mud or sand',            false, false, false, false, 3, true, 'cond_dirt_sand'),
  ('condition', 'heavy_stains', 'Heavy or set-in stains',                 false, false, false, false, 5, true, 'cond_heavy_stains');
update public.form_options set label = 'Pet hair', sort = 2, active = true, fee_code = 'cond_pet_hair'
  where list = 'condition' and code = 'pet_hair';
update public.form_options set label = 'Spills, food or drink, light stains', sort = 4, active = true, fee_code = 'cond_spills'
  where list = 'condition' and code = 'spills';
update public.form_options set label = 'Other (describe it in the notes)', sort = 9, active = true,
       sends_to_review = true, requires_note = true
  where list = 'condition' and code = 'other';
-- Heavy stains are a fixed $30 line now; nothing in the stain list holds the price.
update public.form_options set holds_price = false where list = 'stain';

-- 6. The quote and the booking checks.
create or replace function public.quote_booking(p jsonb) returns jsonb
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
  v_conds text[] := public.json_text_array(p -> 'conditions');
  v_fee_codes text[] := '{}';
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
  if not public.options_valid('condition', v_conds) then
    perform public.fail('invalid_input', 'Choose the vehicle''s condition from the list.', 'conditions');
  end if;
  if cardinality(v_conds) > 1 and exists (
       select 1 from public.form_options o where o.list = 'condition' and o.is_none and o.code = any (v_conds)) then
    perform public.fail('invalid_input', '"None" can''t be combined with other conditions.', 'conditions');
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
    where si.service_id = any (mains) and i.active and i.code not like 'cond\_%'
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
    if v_code like 'cond\_%' then
      perform public.fail('invalid_input', 'That add-on isn''t available.', 'addons');
    end if;
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

  -- Condition fees (Migration 002, doc 24): each chosen condition with a fee
  -- adds a line, unless a chosen service already covers it (shown Included).
  -- They only apply with an interior service; exterior-only bookings have none.
  v_fee_codes := array(select o.fee_code from public.form_options o
                       where o.list = 'condition' and o.fee_code is not null and o.code = any (v_conds)
                       order by o.sort);
  if cardinality(v_fee_codes) > 0 and not ('interior' = any (main_kinds)) then
    perform public.fail('invalid_input', 'Those options apply to interior services. Choose an interior service, or choose None.', 'conditions');
  end if;
  foreach v_code in array v_fee_codes loop
    select * into s from public.services x where x.code = v_code and x.kind = 'addon' and x.active;
    continue when not found;
    if exists (select 1 from public.service_includes si where si.service_id = any (mains) and si.included_id = s.id) then
      lines := lines || jsonb_build_object(
        'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', 0,
        'mobile_cents', 0, 'duration_min', 0, 'included', true, 'condition', true);
      continue;
    end if;
    line_mobile := case when is_mobile then round(s.base_price_cents * s.mobile_pct / 100.0)::int else 0 end;
    lines := lines || jsonb_build_object(
      'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', s.base_price_cents,
      'mobile_cents', line_mobile, 'duration_min', coalesce(s.duration_min, 0), 'included', false, 'condition', true);
    v_value := v_value + s.base_price_cents;
    v_mobile := v_mobile + line_mobile;
    v_minutes := v_minutes + coalesce(s.duration_min, 0);
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

create or replace function public.read_booking_details(p jsonb, p_owner uuid) returns public.booking_details
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
  if cardinality(d.conditions) > 1 and exists (
       select 1 from public.form_options o where o.list = 'condition' and o.is_none and o.code = any (d.conditions)) then
    perform public.fail('invalid_input', '"None" can''t be combined with other conditions.', 'conditions');
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
               'stains', to_jsonb(d.stains),
               'conditions', to_jsonb(d.conditions)));
  d.location_type := (d.quote ->> 'location_type')::public.location_type;
  -- The condition choice is required with an interior service (doc 24): None, or the list.
  if cardinality(d.conditions) = 0 and exists (
       select 1 from jsonb_array_elements(d.quote -> 'lines') as l
       where l ->> 'kind' in ('interior', 'bundle') and not (l ->> 'included')::boolean) then
    perform public.fail('invalid_input', 'Tell us what the car is like, or choose None.', 'conditions');
  end if;
  if d.special_request is null and exists (
       select 1 from public.form_options o where o.list = 'condition' and o.requires_note and o.code = any (d.conditions)) then
    perform public.fail('invalid_input', 'Describe the car''s condition in a few words in the notes.', 'special_request');
  end if;
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
  if exists (select 1 from public.form_options o
             where o.list = 'condition' and o.sends_to_review and o.code = any (d.conditions)) then
    d.review_reasons := d.review_reasons || 'condition'::text;
  end if;
  return d;
end
$$;
