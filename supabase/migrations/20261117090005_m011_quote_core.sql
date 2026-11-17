-- Migration 011, part 5: the quote, priced and timed by vehicle size.
--
-- quote_core(p) is Migration 002's quote_booking body, changed only where the new menu needs it:
-- - a service with priced_by_size takes its price and minutes from service_size_rates for the vehicle's size
--   (vehicle_types.size_group). No size (van, other, "Not sure") or no price for it: the price is held
--   ("we confirm the price", pending reason size_price) and the calendar holds the longest time of any size;
-- - an exterior and an interior service booked together share one setup, pack-up and handover
--   (business_settings.visit_overhead_min is held once);
-- - an add-on listed in addon_allowed_with goes only with the services named there (the bundle, or the exterior or
--   interior service the customer picked);
-- - at most one answer per form_options.choice_group (the two pet-hair answers);
-- - a held price never turns the total into nonsense: unknown prices add nothing, the saving needs every price known,
--   and the total stays null while anything is held (review S4);
-- - the bundle suggestion also offers a bundle with the same inside part and a fuller wash (sort order: Basic Wash,
--   then Hand Wash), never applied (review S7, pending the owner's answer);
-- - it returns the size and, per line, the exact minutes.
-- Services not priced by size (the old menu, retired in part 10) are quoted exactly as before.
-- Owner only: the public quote_booking (part 6) and read_booking_details (part 7) call it.

-- The price, minutes and held-price reason of one service for one vehicle.
create or replace function public.menu_line_rate(s public.services, p_group text, p_type text, p_not_sure boolean,
                                                 out price_cents int, out minutes numeric, out pending text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  pending := null;
  if s.priced_by_size then
    select r.price_cents, r.minutes into price_cents, minutes
      from public.service_size_rates r
     where r.service_id = s.id and r.size_group = p_group;
    if minutes is null then
      -- Unknown size: hold the longest time any size takes.
      select max(r.minutes) into minutes from public.service_size_rates r where r.service_id = s.id;
    end if;
    if price_cents is null then
      pending := 'size_price';
    end if;
  elsif s.priced_by_vehicle_type then
    if not coalesce(p_not_sure, false) and p_type is not null then
      select tp.price_cents into price_cents
        from public.service_type_prices tp
       where tp.service_id = s.id and tp.vehicle_type = p_type;
    end if;
    if price_cents is null then
      pending := 'vehicle_price';
    end if;
    minutes := s.duration_min;
  else
    price_cents := s.base_price_cents;
    minutes := s.duration_min;
  end if;
end
$$;
revoke all on function public.menu_line_rate(public.services, text, text, boolean) from public, anon, authenticated;

create or replace function public.quote_core(p jsonb) returns jsonb
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
  v_group text;
  v_overhead int;
  v_fee_codes text[] := '{}';
  v_dup text;
  is_mobile boolean;
  s public.services;
  pp public.services;
  rt record;
  pr record;
  v_code text;
  v_kind public.service_kind;
  v_needs text;
  v_names text[];
  chosen uuid[] := '{}';
  sized_chosen int := 0;
  mains uuid[] := '{}';
  main_kinds text[] := '{}';
  included_codes text[] := '{}';
  lines jsonb := '[]'::jsonb;
  v_value int := 0;
  v_savings int := 0;
  v_mobile int := 0;
  v_minutes numeric := 0;
  parts_value int;
  parts_known boolean;
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
    perform public.fail('invalid_input', 'Choose what the inside is like from the list.', 'conditions');
  end if;
  if cardinality(v_conds) > 1 and exists (
       select 1 from public.form_options o where o.list = 'condition' and o.is_none and o.code = any (v_conds)) then
    perform public.fail('invalid_input', '"None" can''t be combined with other answers.', 'conditions');
  end if;
  select o.choice_group into v_dup
    from public.form_options o
   where o.list = 'condition' and o.choice_group is not null and o.code = any (v_conds)
   group by o.choice_group
  having count(*) > 1
   limit 1;
  if v_dup is not null then
    perform public.fail('invalid_input',
      case when v_dup = 'pet' then 'Choose one pet-hair answer.' else 'Choose only one of those answers.' end, 'conditions');
  end if;

  -- The vehicle's priced size: none for "Not sure", no type, a van or "Other".
  if not v_not_sure and v_type is not null then
    select t.size_group into v_group from public.vehicle_types t where t.code = v_type;
  end if;
  select st.visit_overhead_min into v_overhead from public.business_settings st where st.id = 1;

  -- Main services: one bundle, or an exterior and/or an interior service.
  if v_bundle is not null then
    if v_ext is not null or v_int is not null then
      perform public.fail('invalid_input', 'Choose a bundle, or exterior and interior services, not both.', 'services');
    end if;
    select * into s from public.services x where x.code = v_bundle and x.kind = 'bundle' and x.active;
    if not found then
      perform public.fail('invalid_input', 'That bundle isn''t available.', 'bundle');
    end if;
    select * into rt from public.menu_line_rate(s, v_group, v_type, v_not_sure);
    if rt.minutes is null then
      perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', 'bundle');
    end if;
    parts_value := 0;
    parts_known := true;
    for pp in
      select x.* from public.bundle_parts bp join public.services x on x.id = bp.part_id where bp.bundle_id = s.id
    loop
      select * into pr from public.menu_line_rate(pp, v_group, v_type, v_not_sure);
      if pr.price_cents is null then
        parts_known := false;
      else
        parts_value := parts_value + pr.price_cents;
      end if;
      mains := mains || pp.id;
      main_kinds := main_kinds || pp.kind::text;
    end loop;
    if cardinality(mains) = 0 then
      perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', 'bundle');
    end if;
    mains := mains || s.id;
    main_kinds := main_kinds || 'bundle'::text;
    chosen := chosen || s.id;
    if s.priced_by_size then
      sized_chosen := sized_chosen + 1;
    end if;
    if rt.pending is not null then
      pending := pending || rt.pending;
    end if;
    line_mobile := case when is_mobile and rt.price_cents is not null
                        then round(rt.price_cents * s.mobile_pct / 100.0)::int else 0 end;
    lines := lines || jsonb_build_object(
      'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', rt.price_cents,
      'mobile_cents', line_mobile, 'duration_min', ceil(rt.minutes)::int, 'minutes_exact', rt.minutes, 'included', false);
    if rt.price_cents is not null then
      if parts_known then
        v_value := v_value + greatest(parts_value, rt.price_cents);
        v_savings := v_savings + greatest(parts_value - rt.price_cents, 0);
      else
        v_value := v_value + rt.price_cents;
      end if;
    end if;
    v_mobile := v_mobile + line_mobile;
    v_minutes := v_minutes + rt.minutes;
  else
    for slot in 1 .. 2 loop
      v_code := case slot when 1 then v_ext else v_int end;
      v_kind := case slot when 1 then 'exterior'::public.service_kind else 'interior'::public.service_kind end;
      continue when v_code is null;
      select * into s from public.services x where x.code = v_code and x.kind = v_kind and x.active;
      if not found then
        perform public.fail('invalid_input', 'That ' || v_kind::text || ' service isn''t available.', v_kind::text);
      end if;
      select * into rt from public.menu_line_rate(s, v_group, v_type, v_not_sure);
      if rt.minutes is null then
        perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', v_kind::text);
      end if;
      if rt.pending is not null then
        pending := pending || rt.pending;
      end if;
      line_mobile := case when is_mobile and rt.price_cents is not null
                          then round(rt.price_cents * s.mobile_pct / 100.0)::int else 0 end;
      lines := lines || jsonb_build_object(
        'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', rt.price_cents,
        'mobile_cents', line_mobile, 'duration_min', ceil(rt.minutes)::int, 'minutes_exact', rt.minutes, 'included', false);
      mains := mains || s.id;
      main_kinds := main_kinds || s.kind::text;
      chosen := chosen || s.id;
      if s.priced_by_size then
        sized_chosen := sized_chosen + 1;
      end if;
      v_value := v_value + coalesce(rt.price_cents, 0);
      v_mobile := v_mobile + line_mobile;
      v_minutes := v_minutes + rt.minutes;
    end loop;
  end if;

  if cardinality(mains) = 0 then
    perform public.fail('invalid_input', 'Choose at least one service. Add-ons can''t be booked on their own.', 'services');
  end if;

  -- One visit: an exterior and an interior service booked together share the setup, pack-up and handover.
  if sized_chosen > 1 then
    v_minutes := v_minutes - coalesce(v_overhead, 0) * (sized_chosen - 1);
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
      'mobile_cents', 0, 'duration_min', 0, 'minutes_exact', 0, 'included', true);
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
    -- Limited to named services (the ones picked, not a bundle's parts).
    if exists (select 1 from public.addon_allowed_with w where w.addon_id = s.id)
       and not exists (select 1 from public.addon_allowed_with w where w.addon_id = s.id and w.service_id = any (chosen)) then
      v_names := array(select x.name from public.addon_allowed_with w join public.services x on x.id = w.service_id
                       where w.addon_id = s.id and x.active order by x.sort);
      perform public.fail('invalid_input',
        s.name || ' goes with the '
        || case when cardinality(v_names) <= 1 then coalesce(v_names[1], 'other services')
                else array_to_string(v_names[1:cardinality(v_names) - 1], ', ') || ' or ' || v_names[cardinality(v_names)] end
        || '.', 'addons');
    end if;
    select coalesce((select r.needs from public.addon_rules r where r.addon_id = s.id), 'any_main') into v_needs;
    if v_needs in ('exterior', 'interior') and not (v_needs = any (main_kinds)) then
      perform public.fail('invalid_input', s.name || ' needs an ' || v_needs || ' service in the same booking.', 'addons');
    end if;
    select * into rt from public.menu_line_rate(s, v_group, v_type, v_not_sure);
    if rt.minutes is null then
      perform public.fail('not_bookable_yet', s.name || ' can''t be booked yet.', 'addons');
    end if;
    if rt.pending is not null then
      pending := pending || rt.pending;
    end if;
    line_mobile := case when is_mobile and rt.price_cents is not null
                        then round(rt.price_cents * s.mobile_pct / 100.0)::int else 0 end;
    lines := lines || jsonb_build_object(
      'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', rt.price_cents,
      'mobile_cents', line_mobile, 'duration_min', ceil(rt.minutes)::int, 'minutes_exact', rt.minutes, 'included', false);
    v_value := v_value + coalesce(rt.price_cents, 0);
    v_mobile := v_mobile + line_mobile;
    v_minutes := v_minutes + rt.minutes;
  end loop;

  -- "What's the inside like?" answers with a fee add a line, unless a chosen service covers it (shown Included).
  -- They only apply with an inside part; exterior-only bookings have none, so any answer but None is refused there
  -- (fee answers and "Other" alike; verifier S-5: bugs, tar and the like go in the notes).
  v_fee_codes := array(select o.fee_code from public.form_options o
                       where o.list = 'condition' and o.fee_code is not null and o.code = any (v_conds)
                       order by o.sort);
  if not ('interior' = any (main_kinds)) and exists (
       select 1 from public.form_options o where o.list = 'condition' and not o.is_none and o.code = any (v_conds)) then
    perform public.fail('invalid_input', 'Those answers apply to services with an inside part. Choose one, or choose None.', 'conditions');
  end if;
  foreach v_code in array v_fee_codes loop
    select * into s from public.services x where x.code = v_code and x.kind = 'addon' and x.active;
    continue when not found;
    if exists (select 1 from public.service_includes si where si.service_id = any (mains) and si.included_id = s.id) then
      lines := lines || jsonb_build_object(
        'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', 0,
        'mobile_cents', 0, 'duration_min', 0, 'minutes_exact', 0, 'included', true, 'condition', true);
      continue;
    end if;
    select * into rt from public.menu_line_rate(s, v_group, v_type, v_not_sure);
    if rt.pending is not null then
      pending := pending || rt.pending;
    end if;
    line_mobile := case when is_mobile and rt.price_cents is not null
                        then round(rt.price_cents * s.mobile_pct / 100.0)::int else 0 end;
    lines := lines || jsonb_build_object(
      'code', s.code, 'name', s.name, 'kind', s.kind, 'price_cents', rt.price_cents,
      'mobile_cents', line_mobile, 'duration_min', ceil(coalesce(rt.minutes, 0))::int,
      'minutes_exact', coalesce(rt.minutes, 0), 'included', false, 'condition', true);
    v_value := v_value + coalesce(rt.price_cents, 0);
    v_mobile := v_mobile + line_mobile;
    v_minutes := v_minutes + coalesce(rt.minutes, 0);
  end loop;

  -- What holds the price until the owner sets it.
  if v_size = 'xl' then
    pending := pending || 'xl'::text;
  end if;
  if exists (select 1 from public.form_options o where o.list = 'stain' and o.holds_price and o.code = any (v_stains)) then
    pending := pending || 'stains'::text;
  end if;
  pending := array(select distinct x from unnest(pending) as x order by 1);

  -- A bundle with the chosen inside part and the same or a fuller wash that costs less is recommended, never applied.
  if v_bundle is null and v_ext is not null and v_int is not null and cardinality(pending) = 0 then
    v_here := v_value - v_savings + v_mobile;
    for v_sugg_code, v_sugg_name in
      select b.code, b.name
      from public.services b
      where b.kind = 'bundle' and b.active
        and (select count(*) from public.bundle_parts bp where bp.bundle_id = b.id) = 2
        and exists (select 1 from public.bundle_parts bp join public.services x on x.id = bp.part_id
                    where bp.bundle_id = b.id and x.code = v_int)
        and exists (select 1 from public.bundle_parts bp join public.services x on x.id = bp.part_id
                    where bp.bundle_id = b.id and x.kind = 'exterior'
                      and (x.code = v_ext or x.sort > (select e.sort from public.services e where e.code = v_ext)))
      order by b.sort
    loop
      begin
        q2 := public.quote_core((p - 'exterior' - 'interior') || jsonb_build_object('bundle', v_sugg_code));
        v_there := (q2 ->> 'value_cents')::int - (q2 ->> 'bundle_savings_cents')::int + (q2 ->> 'mobile_cents')::int;
        -- The bundle that saves the most wins.
        if not (q2 ->> 'price_pending')::boolean and v_there < v_here
           and (v_sugg is null or v_here - v_there > (v_sugg ->> 'saves_cents')::int) then
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
    'size_group', v_group,
    'lines', lines,
    'value_cents', v_value,
    'bundle_savings_cents', v_savings,
    'subtotal_cents', v_value - v_savings,
    'mobile_cents', v_mobile,
    'price_pending', cardinality(pending) > 0,
    'pending_reasons', to_jsonb(pending),
    'total_cents', case when cardinality(pending) > 0 then null else v_value - v_savings + v_mobile end,
    'duration_min', ceil(v_minutes)::int,
    'suggestion', v_sugg);
end
$$;
revoke all on function public.quote_core(jsonb) from public, anon, authenticated;
