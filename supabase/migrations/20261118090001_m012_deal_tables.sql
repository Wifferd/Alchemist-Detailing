-- Migration 012, part 1: First Timer Deals as data (owner, Nov 18, 2026; spec2.md section 2, design2.md 1.2).
--
-- The owner: "Also add on the top 'First time? Checkout First Timer Deals!' With a basic tier cleaning inside and one for
-- outside and on for both at a low price." His answer: "Basic / Clean / both". So three deals replace the single
-- first-time Basic Wash price of Migration 011:
--   outside: the Basic Wash alone            $35 car, $40 SUV 2 rows, 3 rows or pickup, minivan (as today)
--   inside:  the Interior Clean alone         $49.99 car, $59.99 bigger
--   both:    Basic Wash + Interior Clean      $79.99 car, $94.99 bigger, for the two together
-- A deal is "exactly this exterior and/or exactly this interior service, booked with no bundle", priced per size. Each
-- deal line carries its own first-visit price, so the saved lines still add up to the total. "Both" is split as the
-- Outside price on the wash line plus the rest on the inside line ($35 + $44.99, $40 + $54.99; design C9).
-- Who may have a deal is unchanged (first_visit_eligible: one per phone number and one per street address, the first
-- booking only), decided by save_booking under the phone and address locks (part 3).
--
-- Additive: two new tables, one new column on appointments. "outside" is on at once (today's offer, today's prices);
-- "inside" and "both" stay off until part 6, so nothing on sale changes before the site that shows them is deployed.

create table public.first_visit_deals (
  code text primary key check (code ~ '^[a-z][a-z_]{1,29}$'),
  name text not null check (char_length(name) between 1 and 40),
  exterior_id uuid references public.services(id),
  interior_id uuid references public.services(id),
  sort int not null default 0,
  active boolean not null default false,
  constraint first_visit_deals_has_a_service check (exterior_id is not null or interior_id is not null),
  constraint first_visit_deals_pair_key unique nulls not distinct (exterior_id, interior_id)
);
comment on table public.first_visit_deals is
  'First Timer Deals (Migration 012, owner Nov 18): exactly this exterior and/or interior service, no bundle, first visit only.';
comment on column public.first_visit_deals.name is 'The words the site, the receipt and the owner''s list show for the deal.';

create table public.first_visit_deal_rates (
  deal text not null references public.first_visit_deals(code),
  size_group text not null references public.size_groups(code),
  exterior_cents int check (exterior_cents is null or exterior_cents >= 0),
  interior_cents int check (interior_cents is null or interior_cents >= 0),
  primary key (deal, size_group)
);
comment on table public.first_visit_deal_rates is
  'First-visit price (cents) of each deal line per size (Migration 012). A deal applies to a size only while each line''s '
  'price is below that service''s regular rate for the size (first_visit_deal_for), so a later regular-price cut ends the '
  'deal for that size instead of raising anyone''s price.';
comment on column public.first_visit_deal_rates.exterior_cents is 'The deal''s price for its exterior line; set exactly when the deal has one.';
comment on column public.first_visit_deal_rates.interior_cents is 'The deal''s price for its interior line; set exactly when the deal has one.';

alter table public.appointments add column first_visit_deal text references public.first_visit_deals(code);
alter table public.appointments add constraint appointments_first_visit_deal_ok
  check (first_visit_deal is null or first_visit_offer);
comment on column public.appointments.first_visit_deal is
  'Which First Timer Deal the booking got (Migration 012). Null with first_visit_offer = true: saved before Migration 012 (the Basic Wash price, "outside").';

comment on column public.service_size_rates.first_visit_price_cents is
  'Superseded by first_visit_deal_rates (Migration 012) and null everywhere since part 6; kept for old readers.';

-- Who may read and change them: visitors read the deals on sale, the admin adds and edits; no removal grant or policy
-- (a deal is retired with active = false). Same pattern as Migration 011's tables.
alter table public.first_visit_deals enable row level security;
alter table public.first_visit_deal_rates enable row level security;

revoke all on table public.first_visit_deals, public.first_visit_deal_rates from public, anon, authenticated;
grant select on table public.first_visit_deals, public.first_visit_deal_rates to anon, authenticated;
grant insert, update on table public.first_visit_deals, public.first_visit_deal_rates to authenticated;

create policy "Menu: deals on sale" on public.first_visit_deals for select to anon using (active);
create policy "Menu: deals for signed-in users" on public.first_visit_deals for select to authenticated
  using (active or (select public.is_admin()));
create policy "Admin: add deals" on public.first_visit_deals for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit deals" on public.first_visit_deals for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Menu: rates of deals on sale" on public.first_visit_deal_rates for select to anon
  using (exists (select 1 from public.first_visit_deals d where d.code = deal and d.active));
create policy "Menu: deal rates for signed-in users" on public.first_visit_deal_rates for select to authenticated
  using (exists (select 1 from public.first_visit_deals d where d.code = deal and d.active) or (select public.is_admin()));
create policy "Admin: add deal rates" on public.first_visit_deal_rates for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit deal rates" on public.first_visit_deal_rates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create trigger first_visit_deals_audit after insert or update on public.first_visit_deals
  for each row execute function public.audit_changes();
create trigger first_visit_deal_rates_audit after insert or update on public.first_visit_deal_rates
  for each row execute function public.audit_changes();

-- The catalog check, at the end of the transaction (so a deal and its rates can be changed together): the exterior is
-- an exterior service, the interior an interior service, and every rate of the deal has a price for each side the deal
-- has and none for a side it hasn't. Reads the rows as they are now, not as the trigger saw them.
create or replace function public.check_first_visit_deal() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
  v_bad int;
begin
  if tg_table_name = 'first_visit_deals' then
    v_code := new.code;
  else
    v_code := new.deal;
  end if;
  if exists (select 1 from public.first_visit_deals d
             left join public.services e on e.id = d.exterior_id
             left join public.services i on i.id = d.interior_id
             where d.code = v_code
               and ((d.exterior_id is not null and e.kind is distinct from 'exterior')
                 or (d.interior_id is not null and i.kind is distinct from 'interior'))) then
    perform public.fail('invalid_input', 'A deal is an exterior service, an interior service, or one of each.');
  end if;
  select count(*) into v_bad
    from public.first_visit_deals d
    join public.first_visit_deal_rates r on r.deal = d.code
   where d.code = v_code
     and ((r.exterior_cents is null) <> (d.exterior_id is null) or (r.interior_cents is null) <> (d.interior_id is null));
  if v_bad > 0 then
    perform public.fail('invalid_input', 'A deal has a price for each side it covers, and only for those.');
  end if;
  return null;
end
$$;
revoke all on function public.check_first_visit_deal() from public, anon, authenticated;

create constraint trigger first_visit_deals_check after insert or update on public.first_visit_deals
  deferrable initially deferred for each row execute function public.check_first_visit_deal();
create constraint trigger first_visit_deal_rates_check after insert or update on public.first_visit_deal_rates
  deferrable initially deferred for each row execute function public.check_first_visit_deal();

-- The three deals at today's prices. Regular prices go up in part 6; every deal price is below them before and after.
insert into public.first_visit_deals (code, name, exterior_id, interior_id, sort, active)
select v.code, v.name, e.id, i.id, v.sort, v.active
from (values ('outside', 'Outside', 'basic_wash', null, 1, true),
             ('inside', 'Inside', null, 'interior_clean', 2, false),
             ('both', 'Outside + inside', 'basic_wash', 'interior_clean', 3, false)) as v(code, name, ext, inn, sort, active)
left join public.services e on e.code = v.ext
left join public.services i on i.code = v.inn;

insert into public.first_visit_deal_rates (deal, size_group, exterior_cents, interior_cents)
values ('outside', 'car', 3500, null), ('outside', 'two_rows', 4000, null),
       ('outside', 'three_rows', 4000, null), ('outside', 'minivan', 4000, null),
       ('inside', 'car', null, 4999), ('inside', 'two_rows', null, 5999),
       ('inside', 'three_rows', null, 5999), ('inside', 'minivan', null, 5999),
       ('both', 'car', 3500, 4499), ('both', 'two_rows', 4000, 5499),
       ('both', 'three_rows', 4000, 5499), ('both', 'minivan', 4000, 5499);
