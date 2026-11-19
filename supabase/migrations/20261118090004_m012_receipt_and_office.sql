-- Migration 012, part 4: the receipt and the owner's list name the First Timer Deal.
--
-- booking_receipt adds first_visit_deal (the code) and first_visit_deal_name; my_bookings and every submit path return
-- it, so Appointments and the "Request sent" page get it with no other change. A booking that got the first-time price
-- before Migration 012 has no deal code; its name reads as the Outside deal's (it was the Basic Wash price).
-- office.requests keeps its columns, order and types; the Total tag now reads
-- " (First Timer Deal, <name>: phone and address checked)" and the two other address cases as before.

create or replace function public.booking_receipt(a public.appointments) returns jsonb
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
    'first_visit_offer', a.first_visit_offer,
    'first_visit_deal', a.first_visit_deal,
    'first_visit_deal_name', case when a.first_visit_offer then
      (select d.name from public.first_visit_deals d where d.code = coalesce(a.first_visit_deal, 'outside')) end,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', i.code, 'name', i.name, 'kind', i.kind, 'price_cents', i.price_cents,
               'mobile_cents', i.mobile_cents, 'duration_min', i.duration_min, 'included', i.included,
               'regular_cents', i.regular_cents)
             order by i.sort)
      from public.appointment_items i
      where i.appointment_id = a.id), '[]'::jsonb),
    'created_at', a.created_at)
  from public.business_settings s
  where s.id = 1
$$;

create or replace view office.requests as
 select a.ref as "Reference",
    to_char((a.created_at at time zone s.timezone), 'FMMon FMDD, FMHH12:MI AM'::text) as "Received",
        case
            when (a.status = any (array['requested'::public.appointment_status, 'needs_information'::public.appointment_status])) and a.queue = 'spam'::public.intake_queue then 'Spam: holds no time'::text
            when (a.status = any (array['requested'::public.appointment_status, 'needs_information'::public.appointment_status])) and a.hold_expires_at > now() then 'Waiting for you: time held until '::text || to_char((a.hold_expires_at at time zone s.timezone), 'FMDy FMHH12:MI AM'::text)
            when a.status = any (array['requested'::public.appointment_status, 'needs_information'::public.appointment_status]) then 'Waiting for you: time no longer held'::text
            else initcap(replace(a.status::text, '_'::text, ' '::text))
        end as "Status",
    to_char(a.service_date::timestamp with time zone, 'FMDy FMMon FMDD'::text) as "Day",
    (to_char(('00:00:00'::time without time zone + make_interval(mins => a.start_min))::interval, 'FMHH12:MI AM'::text) || ' to '::text) || to_char(('00:00:00'::time without time zone + make_interval(mins => a.end_min))::interval, 'FMHH12:MI AM'::text) as "Time",
    concat_ws(' '::text, a.contact_first, a.contact_last) as "Name",
        case
            when a.contact_phone ~ '^1[0-9]{10}$'::text then (((('('::text || substr(a.contact_phone, 2, 3)) || ') '::text) || substr(a.contact_phone, 5, 3)) || '-'::text) || substr(a.contact_phone, 8, 4)
            else a.contact_phone
        end as "Phone",
        case
            when a.customer_id is null then 'Guest: phone not confirmed'::text
            else 'Confirmed phone'::text
        end as "Who",
        case
            when a.location_type = 'shop'::public.location_type then 'At the shop'::text
            else 'Mobile: '::text || concat_ws(', '::text, a.address, a.address_zip)
        end as "Where",
        case
            when a.vehicle_not_sure then coalesce(a.vehicle_description, 'Not sure'::text)
                 || case when a.vehicle_size = 'xl'::public.vehicle_size then ' (XL)'::text else ''::text end
            else ((concat_ws(' '::text, a.vehicle_year::text, a.vehicle_color, a.vehicle_make, a.vehicle_model) || ' ('::text) || concat_ws(', '::text, a.vehicle_type, nullif(a.vehicle_size::text, 'standard'::text))) || ')'::text
        end as "Vehicle",
    ( select string_agg(i.name, ', '::text order by i.sort) as string_agg
           from public.appointment_items i
          where i.appointment_id = a.id and not i.included) as "Services",
        case
            when a.price_pending then 'Price to set'::text
                 || coalesce(': '::text || nullif(array_to_string(array(
                      select case w.reason when 'xl' then 'XL vehicle'
                                           when 'vehicle_price' then 'WetGloss for this vehicle type'
                                           when 'size_price' then 'price for this vehicle (van, other or not sure)'
                                           when 'stains' then 'stains'
                                           else w.reason end
                      from unnest(a.pending_reasons) with ordinality as w(reason, n) order by w.n), ', '::text), ''::text), ''::text)
            else '$'::text || to_char(a.total_cents::numeric / 100.0, 'FM999990.00'::text)
        end
        || case when not a.first_visit_offer then ''::text
                else ' (First Timer Deal, '::text
                     || coalesce((select d.name from public.first_visit_deals d
                                  where d.code = coalesce(a.first_visit_deal, 'outside')), 'Outside'::text)
                     || case when a.location_type = 'shop'::public.location_type
                               then ': phone checked; no address for Come to us)'::text
                             when public.address_key(a.address, a.address_zip) is null
                               then ': phone checked; address not recognised)'::text
                             else ': phone and address checked)'::text
                        end
           end as "Total",
    nullif(( select string_agg(coalesce(f.label, c.code), ', '::text order by c.n)
               from unnest(a.conditions) with ordinality as c(code, n)
               left join public.form_options f on f.list = 'condition'::text and f.code = c.code), ''::text) as "Condition",
    nullif(concat_ws(': '::text, nullif(array_to_string(a.damage, ', '::text), 'none'::text), a.damage_note), ''::text) as "Damage",
    a.special_request as "Notes",
    a.queue::text as "Lane",
    a.created_at as "Received at"
   from public.appointments a
     cross join public.business_settings s
  where s.id = 1
  order by a.created_at desc;
