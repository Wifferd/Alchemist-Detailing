-- Migration 012, part 3: save_booking decides the First Timer Deal for every booking path.
--
-- Identical to Migration 011 part 7 except that the deal comes from first_visit_deal_for (after the quote is back at
-- regular prices) and the booking records which deal it got (appointments.first_visit_deal). The locks and their order
-- (the caller's day lock, then 7311 for the phone, then 7312 for the street address), the Spam rule, the size_price
-- Review rule and the reference retry loop are unchanged. submit_booking, submit_guest_booking and staff_create_booking
-- are not touched: they all end in read_booking_details, lock_day and save_booking. Browser keys never reach here: the
-- quote is built by read_booking_details from named keys only.

create or replace function public.save_booking(r public.appointments, q jsonb) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_constraint text;
  v_possible boolean;
  v_key text;
  v_offer boolean := false;
  v_deal jsonb;
begin
  -- The First Timer Deal, decided here for every booking path.
  q := public.strip_first_visit(q);
  v_deal := public.first_visit_deal_for(q);
  v_possible := v_deal is not null;
  if v_possible and coalesce(r.queue::text, 'requests') <> 'spam' then
    perform pg_catalog.pg_advisory_xact_lock(7311, hashtext(coalesce(r.contact_phone, '')));
    v_key := public.address_key(r.address, r.address_zip);
    if v_key is not null then
      perform pg_catalog.pg_advisory_xact_lock(7312, hashtext(v_key));
    end if;
    v_offer := public.first_visit_eligible(r.contact_phone, v_key, r.customer_id, null);
  end if;
  if v_possible then
    q := public.apply_first_visit(q, case when v_offer then 'applied' else 'none' end);
  end if;

  -- A price held for the vehicle sends a customer's or guest's request to Review.
  if (q -> 'pending_reasons') ? 'size_price'
     and coalesce(r.status::text, 'requested') = 'requested'
     and coalesce(r.queue::text, 'requests') = 'requests'
     and (r.created_by is null or r.created_by = r.customer_id) then
    r.queue := 'review';
    r.review_reasons := coalesce(r.review_reasons, '{}') || 'size_price'::text;
  end if;

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
        extra_cost_cents, extra_cost_note, created_by, first_visit_offer, first_visit_deal)
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
        r.extra_cost_cents, r.extra_cost_note, r.created_by, v_offer,
        case when v_offer then v_deal ->> 'deal' end)
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
    (appointment_id, service_id, code, name, kind, price_cents, mobile_cents, duration_min, included, sort, regular_cents)
  select a.id, s.id, t.l ->> 'code', t.l ->> 'name', (t.l ->> 'kind')::public.service_kind,
         (t.l ->> 'price_cents')::int, (t.l ->> 'mobile_cents')::int, (t.l ->> 'duration_min')::int,
         (t.l ->> 'included')::boolean, t.ord, (t.l ->> 'regular_cents')::int
  from jsonb_array_elements(q -> 'lines') with ordinality as t(l, ord)
  join public.services s on s.code = t.l ->> 'code';
  return a;
end
$$;
