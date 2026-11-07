-- Applied to the test project on Nov 6, 2026 (version 20261106204817) and to the live project on Nov 7, 2026 (version 20261107002022).
-- Migration 007, part 5: the owner's list in the SQL Editor (office.requests) says why a price is to be set.
--
-- "Price to set" didn't say what holds the price, and a "Not sure" vehicle lost its XL, so an extra set with
-- office.set_extra_cost (which replaces the pending price with one amount) could miss the XL or the WetGloss part.
-- Now Vehicle keeps "(XL)" for a vehicle described in words, Total names the reasons in plain words, and
-- Condition shows the form's labels instead of the codes. Same columns, same order, same types.
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
                                           when 'stains' then 'stains'
                                           else w.reason end
                      from unnest(a.pending_reasons) with ordinality as w(reason, n) order by w.n), ', '::text), ''::text), ''::text)
            else '$'::text || to_char(a.total_cents::numeric / 100.0, 'FM999990.00'::text)
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
