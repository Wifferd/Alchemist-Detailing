-- Migration 012, part 5: what the site may read about the First Timer Deals.
--
-- first_visit_deals_json() (internal): the deals on sale with their prices by size:
--   [{code, name, sort, exterior, interior,
--     prices: {car: {first_visit_cents, regular_cents, lines: {basic_wash: {first_visit_cents, regular_cents}, ...}}, ...}}]
--   regular_cents is the sum of the deal services' regular rates for that size. Only active deals whose services are on
--   sale, and only sizes where every deal price is below its regular price (the same guard as first_visit_deal_for).
-- first_visit_prices(): the Outside deal per size in Migration 011's shape {first_visit_cents, regular_cents}, for old
--   readers. first_visit_offer_live(): the end date while the offer runs and at least one deal is on sale.
-- get_first_visit_offer() (visitors and signed-in users): {active, ends_on, prices, deals}.
-- my_first_visit_offer() (signed-in users): the pop-up check as before, plus deals when it shows.

create or replace function public.first_visit_deals_json() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', d.code, 'name', d.name, 'sort', d.sort, 'exterior', e.code, 'interior', i.code, 'prices', p.prices)
           order by d.sort, d.code), '[]'::jsonb)
  from public.first_visit_deals d
  left join public.services e on e.id = d.exterior_id
  left join public.services i on i.id = d.interior_id
  cross join lateral (
    select jsonb_object_agg(r.size_group, jsonb_build_object(
             'first_visit_cents', coalesce(r.exterior_cents, 0) + coalesce(r.interior_cents, 0),
             'regular_cents', coalesce(re.price_cents, 0) + coalesce(ri.price_cents, 0),
             'lines', case when e.code is null then '{}'::jsonb
                           else jsonb_build_object(e.code, jsonb_build_object('first_visit_cents', r.exterior_cents,
                                                                              'regular_cents', re.price_cents)) end
                      || case when i.code is null then '{}'::jsonb
                              else jsonb_build_object(i.code, jsonb_build_object('first_visit_cents', r.interior_cents,
                                                                                 'regular_cents', ri.price_cents)) end)
             order by g.sort) as prices
    from public.first_visit_deal_rates r
    join public.size_groups g on g.code = r.size_group
    left join public.service_size_rates re on re.service_id = d.exterior_id and re.size_group = r.size_group
    left join public.service_size_rates ri on ri.service_id = d.interior_id and ri.size_group = r.size_group
    where r.deal = d.code
      and (d.exterior_id is null
           or (r.exterior_cents is not null and re.price_cents is not null and r.exterior_cents < re.price_cents))
      and (d.interior_id is null
           or (r.interior_cents is not null and ri.price_cents is not null and r.interior_cents < ri.price_cents))
  ) as p
  where d.active
    and (d.exterior_id is null or e.active)
    and (d.interior_id is null or i.active)
    and p.prices is not null
$$;
revoke all on function public.first_visit_deals_json() from public, anon, authenticated;

create or replace function public.first_visit_prices() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((select jsonb_object_agg(k.key, k.value - 'lines' order by g.sort)
                   from jsonb_array_elements(public.first_visit_deals_json()) as x
                   cross join lateral jsonb_each(x -> 'prices') as k
                   join public.size_groups g on g.code = k.key
                   where x ->> 'code' = 'outside'), '{}'::jsonb)
$$;
revoke all on function public.first_visit_prices() from public, anon, authenticated;

create or replace function public.first_visit_offer_live() returns date
language sql stable security definer set search_path = ''
as $$
  select st.first_visit_offer_ends_on
  from public.business_settings st
  where st.id = 1
    and st.first_visit_offer_ends_on is not null
    and public.local_today() <= st.first_visit_offer_ends_on
    and jsonb_array_length(public.first_visit_deals_json()) > 0
$$;
revoke all on function public.first_visit_offer_live() from public, anon, authenticated;

create or replace function public.get_first_visit_offer() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when e is null
              then jsonb_build_object('active', false, 'ends_on', null, 'prices', '{}'::jsonb, 'deals', '[]'::jsonb)
              else jsonb_build_object('active', true, 'ends_on', e, 'prices', public.first_visit_prices(),
                                      'deals', public.first_visit_deals_json()) end
  from (select public.first_visit_offer_live() as e) x
$$;
revoke all on function public.get_first_visit_offer() from public, anon, authenticated;
grant execute on function public.get_first_visit_offer() to anon, authenticated;

create or replace function public.my_first_visit_offer() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_ends date := public.first_visit_offer_live();
  v_days int;
  v_role text;
  v_active boolean;
  v_created timestamptz;
  v_phone text;
  v_show boolean := false;
begin
  select st.first_visit_popup_days into v_days from public.business_settings st where st.id = 1;
  if uid is not null and v_ends is not null then
    select pr.role::text, pr.is_active, pr.created_at, coalesce(pr.phone, pr.contact_phone)
      into v_role, v_active, v_created, v_phone
      from public.profiles pr where pr.id = uid;
    v_show := coalesce(v_role = 'customer' and v_active
                       and v_created <= now() - make_interval(days => v_days)
                       and public.first_visit_eligible(v_phone, null, uid, null), false);
  end if;
  return jsonb_build_object(
    'show', v_show,
    'ends_on', v_ends,
    'prices', case when v_show then public.first_visit_prices() else '{}'::jsonb end,
    'deals', case when v_show then public.first_visit_deals_json() else '[]'::jsonb end);
end
$$;
revoke all on function public.my_first_visit_offer() from public, anon, authenticated;
grant execute on function public.my_first_visit_offer() to authenticated;
