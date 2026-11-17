-- Migration 011, part 6: the first-time Basic Wash price, and the public quote.
--
-- The offer (owner, Nov 17): a first-time customer's first Basic Wash is $35 (car) / $40 (2 rows, 3 rows or pickup,
-- minivan) until business_settings.first_visit_offer_ends_on (Feb 17, 2027, Parker's date). One per phone number and one
-- per street address. Only the Basic Wash line; add-ons and inside answers at their usual prices; never on a held price.
--
-- Who has had a "first visit" (first_visit_eligible): any booking request still in play or done with the same phone, the
-- same street address or the same account: requested or needs-information (whatever its 24-hour hold: the owner can still
-- confirm a lapsed request, review B3), confirmed, in progress, completed. Not counted: declined, cancelled, the Spam lane
-- (the hidden-field trap: a bot typing someone's number must not cost them the offer) and anonymized bookings.
--
-- The saved booking is the decision (save_booking, part 8, under phone and address locks). The public quote shows the
-- price "if this is your first visit" and never tests a typed phone or address, so it can't tell anyone whether a number
-- or a street has booked here (design C2). A signed-in customer's quote checks their own history only.

create or replace function public.first_visit_eligible(p_phone text, p_key text, p_customer uuid, p_exclude uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.appointments x
    where (p_exclude is null or x.id <> p_exclude)
      and x.status in ('requested', 'needs_information', 'confirmed', 'in_progress', 'completed')
      and x.queue <> 'spam'
      and x.anonymized_at is null
      and ((p_phone is not null and x.contact_phone = coalesce(public.normalize_phone(p_phone), p_phone))
        or (p_key is not null and x.address is not null and public.address_key(x.address, x.address_zip) = p_key)
        or (p_customer is not null and x.customer_id = p_customer)))
$$;
revoke all on function public.first_visit_eligible(text, text, uuid, uuid) from public, anon, authenticated;

-- The offer a quote can carry: the Basic Wash line's first-visit and regular price for the quote's size, while the
-- offer runs, the Basic Wash is on sale and nothing in the quote is held. No row when there is none.
create or replace function public.first_visit_offer_for(q jsonb, out first_visit_cents int, out regular_cents int,
                                                        out ends_on date)
language sql stable security definer set search_path = ''
as $$
  select r.first_visit_price_cents, r.price_cents, st.first_visit_offer_ends_on
  from public.business_settings st
  join public.services s on s.code = 'basic_wash' and s.active
  join public.service_size_rates r on r.service_id = s.id and r.size_group = q ->> 'size_group'
  where st.id = 1
    and st.first_visit_offer_ends_on is not null
    and public.local_today() <= st.first_visit_offer_ends_on
    and r.first_visit_price_cents is not null
    and not coalesce((q ->> 'price_pending')::boolean, false)
    and exists (select 1 from jsonb_array_elements(q -> 'lines') as l
                where l ->> 'code' = 'basic_wash' and not coalesce((l ->> 'included')::boolean, false)
                  and (l ->> 'price_cents')::int = r.price_cents)
$$;
revoke all on function public.first_visit_offer_for(jsonb) from public, anon, authenticated;

-- Puts the offer on a quote. p_status: null (no offer block), 'if_first_visit' (the public quote: shown as the price
-- "if this is your first visit"), 'applied' (a saved booking got it), 'not_eligible' (a signed-in customer's own
-- history), 'none' (a saved booking that didn't get it). The Basic Wash line gets price_cents = the first-visit price,
-- regular_cents and first_visit: true; value, subtotal and total go down by the difference.
create or replace function public.apply_first_visit(q jsonb, p_status text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  o record;
  v_diff int;
begin
  if p_status is null then
    return q || jsonb_build_object('first_visit', null);
  end if;
  select * into o from public.first_visit_offer_for(q);
  if o.first_visit_cents is null then
    return q || jsonb_build_object('first_visit', null);
  end if;
  if p_status in ('if_first_visit', 'applied') then
    v_diff := o.regular_cents - o.first_visit_cents;
    q := q || jsonb_build_object(
      'lines', (select jsonb_agg(case when t.l ->> 'code' = 'basic_wash' and not coalesce((t.l ->> 'included')::boolean, false)
                                      then t.l || jsonb_build_object('price_cents', o.first_visit_cents,
                                                                     'regular_cents', o.regular_cents, 'first_visit', true)
                                      else t.l end order by t.n)
                from jsonb_array_elements(q -> 'lines') with ordinality as t(l, n)),
      'value_cents', (q ->> 'value_cents')::int - v_diff,
      'subtotal_cents', (q ->> 'subtotal_cents')::int - v_diff,
      'total_cents', case when q ->> 'total_cents' is null then null else (q ->> 'total_cents')::int - v_diff end);
  end if;
  return q || jsonb_build_object('first_visit', jsonb_build_object(
    'status', p_status, 'ends_on', o.ends_on, 'price_cents', o.first_visit_cents, 'regular_cents', o.regular_cents));
end
$$;
revoke all on function public.apply_first_visit(jsonb, text) from public, anon, authenticated;

-- The public quote (same input and output as before, plus size_group, each line's minutes_exact and first_visit).
create or replace function public.quote_booking(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  q jsonb;
  uid uuid := auth.uid();
  v_status text := 'if_first_visit';
  v_role text;
  v_phone text;
begin
  q := public.quote_core(p);
  if (select o.first_visit_cents from public.first_visit_offer_for(q) o) is null then
    return public.apply_first_visit(q, null);
  end if;
  if uid is not null then
    select pr.role::text, coalesce(pr.phone, pr.contact_phone) into v_role, v_phone
      from public.profiles pr where pr.id = uid;
    if v_role = 'customer' and not public.first_visit_eligible(v_phone, null, uid, null) then
      v_status := 'not_eligible';
    end if;
  end if;
  q := public.apply_first_visit(q, v_status);
  -- A suggested bundle is measured against the price shown (with the first-time price, it may save less, or nothing).
  if q -> 'suggestion' is not null and jsonb_typeof(q -> 'suggestion') = 'object' and v_status = 'if_first_visit' then
    if (q ->> 'total_cents')::int - (q -> 'suggestion' ->> 'total_cents')::int > 0 then
      q := jsonb_set(q, '{suggestion,saves_cents}',
                     to_jsonb((q ->> 'total_cents')::int - (q -> 'suggestion' ->> 'total_cents')::int));
    else
      q := q || jsonb_build_object('suggestion', null);
    end if;
  end if;
  return q;
end
$$;
