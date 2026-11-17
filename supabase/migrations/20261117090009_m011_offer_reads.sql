-- Migration 011, part 9: what the site may read about the first-time offer.
--
-- get_first_visit_offer() (visitors and signed-in users): whether the offer runs, its end date and the prices by size,
--   for the Services page and the Basic Wash card, so the end date the owner sets shows everywhere.
-- my_first_visit_offer() (signed-in users only): whether to show the signed-in customer the pop-up (owner, Nov 17:
--   "4 weeks after account is made, pop up notification showing the promo"): a customer account at least
--   first_visit_popup_days old (28), active, with no booking yet (counted as in first_visit_eligible: the account or its
--   phone), while the offer runs. Nothing about anyone else. Accounts need Twilio Verify, so until then it shows to nobody.
--
-- The calendar keeps get_calendar and get_availability: the site sends the quote's own duration_min, and every submit
-- path re-checks the slot with the database's minutes under the day lock, so no new calendar function is needed
-- (review S13).

create or replace function public.first_visit_prices() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(r.size_group, jsonb_build_object(
           'first_visit_cents', r.first_visit_price_cents, 'regular_cents', r.price_cents) order by g.sort), '{}'::jsonb)
  from public.services s
  join public.service_size_rates r on r.service_id = s.id
  join public.size_groups g on g.code = r.size_group
  where s.code = 'basic_wash' and s.active and r.first_visit_price_cents is not null
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
    and exists (select 1 from public.services s
                join public.service_size_rates r on r.service_id = s.id
                where s.code = 'basic_wash' and s.active and r.first_visit_price_cents is not null)
$$;
revoke all on function public.first_visit_offer_live() from public, anon, authenticated;

create or replace function public.get_first_visit_offer() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when e is null
              then jsonb_build_object('active', false, 'ends_on', null, 'prices', '{}'::jsonb)
              else jsonb_build_object('active', true, 'ends_on', e, 'prices', public.first_visit_prices()) end
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
    'prices', case when v_show then public.first_visit_prices() else '{}'::jsonb end);
end
$$;
revoke all on function public.my_first_visit_offer() from public, anon, authenticated;
grant execute on function public.my_first_visit_offer() to authenticated;
