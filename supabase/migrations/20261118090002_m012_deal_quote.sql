-- Migration 012, part 2: which First Timer Deal a quote can carry, and putting it on the quote.
--
-- quote_booking (Migration 011 part 6) keeps its body: it asks first_visit_offer_for(q) whether there is an offer, then
-- apply_first_visit, and measures a bundle suggestion against the total shown. Both become deal-aware here, so the
-- public "if this is your first visit" price, not_eligible for a signed-in customer with history, and "no Inside & Out
-- suggestion when the deal makes the pair cheaper" (spec2) all follow. The public quote still never tests a typed phone
-- or address.

-- The deal a quote can carry, or null. All must hold: the offer runs on Parker's date; nothing in the quote is held; an
-- active deal has a rate for the quote's size and its services are on sale; the quote's main lines (exterior, interior,
-- bundle; not included) are exactly the deal's services (a bundle line means no deal); each of those lines is at its
-- regular price for the size (an already discounted quote never matches twice); each deal price is below that regular
-- price. Lowest sort wins (the pair is unique, so only one can match).
create or replace function public.first_visit_deal_for(q jsonb) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with st as (
    select s.first_visit_offer_ends_on as ends_on
    from public.business_settings s
    where s.id = 1 and s.first_visit_offer_ends_on is not null and public.local_today() <= s.first_visit_offer_ends_on
  ), ql as (
    select l ->> 'code' as code, (l ->> 'price_cents')::int as price
    from jsonb_array_elements(coalesce(q -> 'lines', '[]'::jsonb)) as l
    where l ->> 'kind' in ('exterior', 'interior', 'bundle')
      and not coalesce((l ->> 'included')::boolean, false)
  ), m as (
    select d.code, d.name, st.ends_on, e.code as ext_code, i.code as int_code,
           r.exterior_cents, r.interior_cents, re.price_cents as ext_regular, ri.price_cents as int_regular
    from public.first_visit_deals d
    cross join st
    join public.first_visit_deal_rates r on r.deal = d.code and r.size_group = q ->> 'size_group'
    left join public.services e on e.id = d.exterior_id
    left join public.services i on i.id = d.interior_id
    left join public.service_size_rates re on re.service_id = d.exterior_id and re.size_group = r.size_group
    left join public.service_size_rates ri on ri.service_id = d.interior_id and ri.size_group = r.size_group
    where d.active
      and not coalesce((q ->> 'price_pending')::boolean, false)
      and (d.exterior_id is null
           or (e.active and r.exterior_cents is not null and re.price_cents is not null and r.exterior_cents < re.price_cents))
      and (d.interior_id is null
           or (i.active and r.interior_cents is not null and ri.price_cents is not null and r.interior_cents < ri.price_cents))
      and (select coalesce(array_agg(ql.code order by ql.code), '{}'::text[]) from ql)
          = array(select c from unnest(array[e.code, i.code]) as c where c is not null order by c)
      and not exists (select 1 from ql
                      where ql.price is distinct from case when ql.code = e.code then re.price_cents
                                                           when ql.code = i.code then ri.price_cents end)
    order by d.sort, d.code
    limit 1
  )
  select jsonb_build_object(
           'deal', m.code,
           'name', m.name,
           'codes', to_jsonb(array_remove(array[m.ext_code, m.int_code], null)),
           'ends_on', m.ends_on,
           'price_cents', coalesce(m.exterior_cents, 0) + coalesce(m.interior_cents, 0),
           'regular_cents', coalesce(m.ext_regular, 0) + coalesce(m.int_regular, 0),
           'lines', case when m.ext_code is null then '{}'::jsonb
                         else jsonb_build_object(m.ext_code, jsonb_build_object('price_cents', m.exterior_cents,
                                                                                 'regular_cents', m.ext_regular)) end
                    || case when m.int_code is null then '{}'::jsonb
                            else jsonb_build_object(m.int_code, jsonb_build_object('price_cents', m.interior_cents,
                                                                                    'regular_cents', m.int_regular)) end)
  from m
$$;
revoke all on function public.first_visit_deal_for(jsonb) from public, anon, authenticated;
comment on function public.first_visit_deal_for(jsonb) is
  'The First Timer Deal a quote can carry (Migration 012): {deal, name, codes, ends_on, price_cents, regular_cents, lines}, or null.';

-- Same OUT signature as Migration 011 (quote_booking reads first_visit_cents): now the deal's totals.
create or replace function public.first_visit_offer_for(q jsonb, out first_visit_cents int, out regular_cents int,
                                                        out ends_on date)
language sql stable security definer set search_path = ''
as $$
  select (x.o ->> 'price_cents')::int, (x.o ->> 'regular_cents')::int, (x.o ->> 'ends_on')::date
  from (select public.first_visit_deal_for(q) as o) as x
  where x.o is not null
$$;
revoke all on function public.first_visit_offer_for(jsonb) from public, anon, authenticated;

-- Puts the deal on a quote. p_status: null (no block), 'if_first_visit' (the public quote), 'applied' (a saved booking
-- got it), 'not_eligible' (a signed-in customer's own history), 'none' (a saved booking that didn't get it). For
-- if_first_visit and applied, each deal line gets its deal price, regular_cents and first_visit: true (the keys
-- strip_first_visit takes off again); value, subtotal and total go down by the difference.
create or replace function public.apply_first_visit(q jsonb, p_status text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  o jsonb;
  v_diff int;
begin
  if p_status is null then
    return q || jsonb_build_object('first_visit', null);
  end if;
  o := public.first_visit_deal_for(q);
  if o is null then
    return q || jsonb_build_object('first_visit', null);
  end if;
  if p_status in ('if_first_visit', 'applied') then
    v_diff := (o ->> 'regular_cents')::int - (o ->> 'price_cents')::int;
    q := q || jsonb_build_object(
      'lines', (select jsonb_agg(case when not coalesce((t.l ->> 'included')::boolean, false)
                                           and t.l ->> 'kind' in ('exterior', 'interior')
                                           and (o -> 'lines') ? (t.l ->> 'code')
                                      then t.l || jsonb_build_object(
                                             'price_cents', (o -> 'lines' -> (t.l ->> 'code') ->> 'price_cents')::int,
                                             'regular_cents', (o -> 'lines' -> (t.l ->> 'code') ->> 'regular_cents')::int,
                                             'first_visit', true)
                                      else t.l end order by t.n)
                from jsonb_array_elements(q -> 'lines') with ordinality as t(l, n)),
      'value_cents', (q ->> 'value_cents')::int - v_diff,
      'subtotal_cents', (q ->> 'subtotal_cents')::int - v_diff,
      'total_cents', case when q ->> 'total_cents' is null then null else (q ->> 'total_cents')::int - v_diff end);
  end if;
  return q || jsonb_build_object('first_visit', jsonb_build_object(
    'status', p_status, 'deal', o ->> 'deal', 'name', o ->> 'name', 'codes', o -> 'codes', 'ends_on', o ->> 'ends_on',
    'price_cents', (o ->> 'price_cents')::int, 'regular_cents', (o ->> 'regular_cents')::int));
end
$$;
revoke all on function public.apply_first_visit(jsonb, text) from public, anon, authenticated;
