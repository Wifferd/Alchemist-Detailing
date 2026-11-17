-- Migration 011, part 1: the new menu's tables and columns (owner, Nov 16-17, 2026; spec.md, design.md).
--
-- Prices and minutes by vehicle size (car / SUV or crossover, 2 rows / 3 rows or pickup / minivan), add-ons limited to
-- named services, the "What's the inside like?" pet-hair pair, and the first-time Basic Wash offer.
-- Everything here is additive: no table, column or row goes away; old rows are retired with active = false (part 10).
--
-- The "same address" test uses an expression index on address_key(address, address_zip), not a stored column, so no
-- street address is copied into audit_log and an anonymized booking keeps nothing of it (review B1).

-- An address as a match key: "<zip>|<house number>|<street name>", null unless both the address and the ZIP are known.
-- Lower case, the text before the first comma, without a unit (#, apt, apartment, unit, suite, ste and what follows),
-- punctuation, direction words or the USPS street suffix. "123 N. Main Street, Apt 4" and "123 main st" in 75002 give
-- "75002|123|main". Accepted: two units of one building share a key; "123 Main St" and "123 Main Ct" in one ZIP collide.
create or replace function public.address_key(p_address text, p_zip text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  with a as (
    select substring(coalesce(p_zip, '') from '([0-9]{5})') as zip,
           btrim(regexp_replace(regexp_replace(regexp_replace(
             lower(split_part(coalesce(p_address, ''), ',', 1)),
             '(#|\m(apt|apartment|unit|suite|ste)\M).*$', ''),
             '[^a-z0-9 ]', ' ', 'g'),
             '\s+', ' ', 'g')) as s
  ), b as (
    select zip,
           substring(s from '^([0-9]+[a-z]?) ') as num,
           string_to_array(regexp_replace(s, '^[0-9]+[a-z]? ', ''), ' ') as words
    from a
  ), c as (
    select zip, num, words,
           array_to_string(array(
             select w from unnest(words) with ordinality as u(w, n)
             where w <> '' and w not in (
               'n', 'north', 's', 'south', 'e', 'east', 'w', 'west',
               'ne', 'northeast', 'nw', 'northwest', 'se', 'southeast', 'sw', 'southwest',
               'street', 'st', 'avenue', 'ave', 'av', 'drive', 'dr', 'road', 'rd', 'lane', 'ln', 'court', 'ct',
               'circle', 'cir', 'boulevard', 'blvd', 'parkway', 'pkwy', 'place', 'pl', 'trail', 'trl',
               'terrace', 'ter', 'way', 'highway', 'hwy', 'loop', 'cove', 'cv')
             order by n), ' ') as street
    from b
  )
  select case
           when zip is null or num is null then null
           else zip || '|' || num || '|'
                || coalesce(nullif(street, ''), array_to_string(words, ' '))
         end
  from c
$$;
comment on function public.address_key(text, text) is
  'Match key for "the same street address" (first-time offer, Migration 011): zip|house number|street name.';

-- The four priced sizes.
create table public.size_groups (
  code text primary key check (code ~ '^[a-z][a-z_]{1,29}$'),
  name text not null check (char_length(name) between 1 and 40),
  short_name text not null check (char_length(short_name) between 1 and 30),
  sort int not null default 0
);
comment on table public.size_groups is 'Priced vehicle sizes (Migration 011): car, two_rows, three_rows, minivan.';

-- Price and on-site minutes of a service for each size. A null price is "we confirm the price".
create table public.service_size_rates (
  service_id uuid not null references public.services(id),
  size_group text not null references public.size_groups(code),
  price_cents int check (price_cents is null or price_cents >= 0),
  minutes numeric(6,2) not null check (minutes between 0 and 720),
  first_visit_price_cents int check (first_visit_price_cents is null
    or (first_visit_price_cents >= 0 and price_cents is not null and first_visit_price_cents < price_cents)),
  primary key (service_id, size_group)
);
create index service_size_rates_size_idx on public.service_size_rates (size_group);
comment on table public.service_size_rates is
  'Price (cents) and real on-site minutes (setup, work, pack-up, handover; unrounded) per service and size. Migration 011.';
comment on column public.service_size_rates.first_visit_price_cents is
  'The first-time customer price (Basic Wash only), while business_settings.first_visit_offer_ends_on has not passed.';

-- An add-on limited to named services: with rows here, one of the services the customer picked at the top level
-- (the bundle, or the exterior or interior service) must be listed. Without rows, addon_rules.needs applies.
create table public.addon_allowed_with (
  addon_id uuid not null references public.services(id),
  service_id uuid not null references public.services(id),
  primary key (addon_id, service_id),
  check (addon_id <> service_id)
);
create index addon_allowed_with_service_idx on public.addon_allowed_with (service_id);

-- New columns.
alter table public.vehicle_types add column size_group text references public.size_groups(code);
comment on column public.vehicle_types.size_group is 'The priced size of this type; null = "we confirm the price" (van, other).';

alter table public.services add column priced_by_size boolean not null default false;
alter table public.services add constraint services_size_priced_ok check (not (priced_by_size and priced_by_vehicle_type));
comment on column public.services.priced_by_size is
  'Price and minutes come from service_size_rates (Migration 011); base_price_cents and duration_min then hold the car figures for old readers only.';

alter table public.form_options add column choice_group text
  check (choice_group is null or choice_group ~ '^[a-z][a-z_]{0,29}$');
alter table public.form_options add column description text
  check (description is null or char_length(description) <= 200);
comment on column public.form_options.choice_group is 'At most one chosen answer per group (the two pet-hair answers).';

alter table public.business_settings add column first_visit_offer_ends_on date;
alter table public.business_settings add column first_visit_popup_days int not null default 28
  check (first_visit_popup_days between 1 and 365);
alter table public.business_settings add column visit_overhead_min int not null default 32
  check (visit_overhead_min between 0 and 120);
comment on column public.business_settings.first_visit_offer_ends_on is
  'Last day (Parker time) a request can get the first-time Basic Wash price; null = no offer.';
comment on column public.business_settings.first_visit_popup_days is 'Account age in days before the offer pop-up shows.';
comment on column public.business_settings.visit_overhead_min is
  'Setup + pack-up + handover minutes held once per visit: an exterior and an interior service booked together share them.';

alter table public.appointments add column first_visit_offer boolean not null default false;
comment on column public.appointments.first_visit_offer is 'The booking got the first-time Basic Wash price (decided when it was saved).';

alter table public.appointment_items add column regular_cents int check (regular_cents is null or regular_cents >= 0);
comment on column public.appointment_items.regular_cents is 'The regular price of a line that carries the first-time price.';

-- Indexes for the first-time test (phone and address; the account uses appointments_customer_idx).
create index appointments_contact_phone_idx on public.appointments (contact_phone) where contact_phone is not null;
create index appointments_address_key_idx on public.appointments (public.address_key(address, address_zip))
  where address is not null;
