-- Migration 011, part 7: save_booking decides the first-time price, and sends a held vehicle price to Review.
--
-- Every booking path (submit_booking, submit_guest_booking, staff_create_booking) checks the booking with
-- read_booking_details, takes the day lock (lock_day, 7302), re-checks the slot with the database's own minutes, and
-- calls save_booking last. So the new rules go here and none of those functions (which differ between the test and live
-- projects) changes. read_booking_details stays as it is (Migration 002); its quote_booking call now returns the
-- public "if first visit" price, which is taken off again here before the decision.
--
-- The first-time Basic Wash price:
--   1. any first-time price in the quote is taken off (the quote is back to regular prices);
--   2. if the quote could carry the offer (a priced Basic Wash line, nothing held, the offer still running on Parker's
--      date) and the booking isn't in the Spam lane: lock the phone (7311) and then the street address (7312), and ask
--      first_visit_eligible as its own statement, so it reads a fresh snapshot that includes any booking another
--      request for this phone or address committed while this one waited for the lock. Every path takes the day lock
--      first, and phone before address, so the locks are always taken in the same order (no deadlock);
--   3. the price goes on the Basic Wash line ("applied") or not ("none"); first_visit_offer and each line's
--      regular_cents are saved with the booking. A saved booking keeps its price.
--
-- A price held for the vehicle (van, "Other" or "Not sure": size_price) sends a customer's or guest's request to
-- Review (owner, Nov 17: "we confirm the price ... goes to Review"). A booking staff enter themselves (created_by is
-- another person than the customer) stays where staff put it.

-- Takes any first-time price off a quote: each line that carries one goes back to its regular price.
create or replace function public.strip_first_visit(q jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  with t as (
    select l, n, coalesce((l ->> 'regular_cents')::int - (l ->> 'price_cents')::int, 0) as diff
    from jsonb_array_elements(coalesce(q -> 'lines', '[]'::jsonb)) with ordinality as x(l, n)
  ), d as (
    select coalesce(sum(diff) filter (where l ? 'regular_cents'), 0)::int as diff,
           coalesce(jsonb_agg(case when l ? 'regular_cents'
                                   then (l - 'regular_cents' - 'first_visit')
                                        || jsonb_build_object('price_cents', (l ->> 'regular_cents')::int)
                                   else l end order by n), '[]'::jsonb) as lines
    from t
  )
  select (q - 'first_visit') || jsonb_build_object(
           'lines', d.lines,
           'value_cents', (q ->> 'value_cents')::int + d.diff,
           'subtotal_cents', (q ->> 'subtotal_cents')::int + d.diff,
           'total_cents', case when q ->> 'total_cents' is null then null else (q ->> 'total_cents')::int + d.diff end)
  from d
$$;
revoke all on function public.strip_first_visit(jsonb) from public, anon, authenticated;

create or replace function public.save_booking(r public.appointments, q jsonb) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_constraint text;
  v_possible boolean;
  v_key text;
  v_offer boolean := false;
begin
  -- The first-time Basic Wash price, decided here for every booking path.
  q := public.strip_first_visit(q);
  v_possible := (select o.first_visit_cents from public.first_visit_offer_for(q) as o) is not null;
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
        extra_cost_cents, extra_cost_note, created_by, first_visit_offer)
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
        r.extra_cost_cents, r.extra_cost_note, r.created_by, v_offer)
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
