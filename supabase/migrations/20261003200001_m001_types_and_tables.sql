-- =====================================================================
-- Alchemist Detailing — Migration 001: foundation
--
-- Accounts and roles, the service catalog and prices, booking with holds and
-- availability, the staff workflow, access rules, and private photo storage.
--
-- Built Oct 3, 2026 from the approved "Migration 001 audit & completion plan"
-- (owner decisions, rounds 1 to 7). It replaces the unfinished draft.
--
-- Migration 001 is six files, applied in order, once, on an empty Supabase
-- project, through Supabase's migration tooling:
--   1 types and tables   2 roles and triggers, menu   3 prices, open times, booking
--   4 staff and admin actions   5 access rules and photo storage   6 email blocklist
-- Each file runs in one transaction: a second run fails on its first
-- statement and changes nothing.
--
-- Access rule for later migrations: Supabase no longer grants new tables or
-- functions to the website's roles automatically (file 5); grant explicitly.
--
-- Error contract for the website. Functions raise SQLSTATE P0001 with:
--   message = a stable code: sign_in_required, phone_not_verified, not_allowed,
--             mfa_required, invalid_input, not_bookable_yet, outside_service_area,
--             slot_unavailable, too_many_requests, not_found, wrong_state
--   detail  = a sentence that can be shown to the person
--   hint    = the field it concerns, when there is one
--
-- Times: a booking is a local date plus minutes after midnight in the business
-- time zone (America/Chicago), so daylight-saving changes never move a booking.
-- Money: whole cents, always computed by the database.
-- Phone numbers: stored the way Supabase Auth stores them, a 1 followed by the
-- 10-digit US number, with no plus sign (for example 19455550123).
-- =====================================================================

-- ---------------------------------------------------------------------
-- No automatic access. Supabase grants every new table and function to the
-- website's roles by default; turn that off before creating anything, so no
-- object is ever reachable from the website before file 5 grants exactly
-- what each role needs (W-11, F-43).
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.user_role as enum ('customer', 'detailer', 'manager', 'admin');
comment on type public.user_role is 'detailer = tier 1, manager = tier 2, admin = the owner (decided Oct 3).';

create type public.appointment_status as enum
  ('requested', 'needs_information', 'confirmed', 'in_progress', 'completed', 'declined', 'cancelled');
comment on type public.appointment_status is
  'requested and needs_information hold their time until the hold expires; confirmed and in_progress hold it for good.';

create type public.intake_queue as enum ('requests', 'review', 'spam');
create type public.service_kind as enum ('exterior', 'interior', 'bundle', 'addon');
create type public.location_type as enum ('mobile', 'shop');
comment on type public.location_type is 'mobile = "We come to you"; shop = "Come to us" (the owner''s driveway).';
create type public.vehicle_size as enum ('standard', 'xl');
create type public.job_request_status as enum ('open', 'approved', 'declined', 'withdrawn');
create type public.review_request_status as enum ('open', 'resolved');

-- ---------------------------------------------------------------------
-- Small pure helpers (no table access)
-- ---------------------------------------------------------------------

-- Raises the documented error shape. Volatile on purpose, so it is never
-- evaluated early by the planner.
create function public.fail(p_code text, p_message text, p_field text default null)
returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_message, hint = coalesce(p_field, '');
end
$$;

create function public.try_uuid(p text) returns uuid
language sql immutable set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

create function public.try_int(p text) returns int
language sql immutable set search_path = ''
as $$
  select case when p ~ '^-?[0-9]{1,9}$' then p::int end
$$;

create function public.try_date(p text) returns date
language plpgsql immutable set search_path = ''
as $$
begin
  if p is null or p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return p::date;
exception when others then
  return null;
end
$$;

-- No links, no emojis, no angle brackets (no HTML), no control characters
-- (new lines and tabs are fine).
create function public.is_clean_text(t text) returns boolean
language sql immutable set search_path = ''
as $$
  select t is null or (
        t !~* '(https?:|www\.|\m[a-z0-9_-]+\.(com|net|org|io|co|app|me|ly|info|xyz|ru|cn|site|shop|link)\M)'
    and t !~ '[<>]'
    and t !~ '[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]'
    and t !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  )
$$;

-- Keyboard mashing and placeholder words. Used to send unclear vehicle details
-- to the Review lane; it never blocks a booking on its own.
create function public.looks_like_junk(t text) returns boolean
language sql immutable set search_path = ''
as $$
  select t is not null and (
       char_length(btrim(t)) < 2
    or lower(t) ~ '(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|zxcv|xcvb|cvbn|vbnm|uiop|qaz|wsx)'
    or lower(t) ~ '(.)\1{3,}'
    or lower(btrim(t)) in ('test', 'testing', 'fake', 'none', 'null', 'n/a', 'idk', 'xxx', 'abc', 'asd', 'qwe', 'blah')
  )
$$;

-- Short model names are real (Tesla 3, S, X, Y; Mazda 3; BMW M3; Audi Q5), so a
-- model of up to 3 letters or digits is fine whenever the make itself looks real.
create function public.model_looks_like_junk(p_make text, p_model text) returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when p_model is null then false
    when btrim(p_model) ~ '^[A-Za-z0-9]{1,3}$' and p_make is not null and not public.looks_like_junk(p_make) then false
    else public.looks_like_junk(p_model)
  end
$$;

-- Swear words and slurs. Whole words only, except two strings that never occur
-- in real names, so real names such as Dickerson, Cassandra or Hitchcock pass.
create function public.has_profanity(t text) returns boolean
language sql immutable set search_path = ''
as $$
  select exists (
           select 1
           from regexp_split_to_table(lower(coalesce(t, '')), '[^[:alpha:]]+') as w(word)
           where w.word = any (array[
             'fuck', 'fucker', 'fuckers', 'fucking', 'fuk', 'fck', 'motherfucker', 'shit', 'shitty', 'bullshit',
             'bitch', 'bitches', 'cunt', 'pussy', 'asshole', 'ass', 'arse', 'bastard', 'slut', 'whore', 'fag',
             'fags', 'faggot', 'faggots', 'retard', 'penis', 'vagina', 'cock', 'tits', 'titty', 'boobs', 'porn',
             'nazi', 'hitler', 'rape', 'rapist', 'nigger', 'niggers', 'nigga', 'niggas', 'chink', 'spic', 'kike',
             'wetback', 'twat', 'wank', 'wanker', 'prick', 'dildo', 'cum', 'jizz', 'horny', 'sexy', 'poop', 'crap',
             'douche', 'douchebag'])
         )
      or lower(coalesce(t, '')) ~ '(fuck|cunt)'
$$;

-- A first or last name: letters in any language, with spaces, hyphens,
-- apostrophes and periods (O'Brien, Mary-Jane, St. John, José, Nguyễn).
-- Blocks keyboard mashing, runs of one letter, placeholder words and swear words.
-- Software can't prove a name is real; the text-verified phone number does that.
create function public.is_valid_name(t text) returns boolean
language sql immutable set search_path = ''
as $$
  select t is not null
     and char_length(btrim(t)) between 1 and 40
     and btrim(t) ~ '^[[:alpha:]]([[:alpha:]''\u2019 .-]*[[:alpha:].])?$'
     and lower(btrim(t)) !~ '(.)\1\1'
     and lower(t) !~ '(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|zxcv|xcvb|cvbn|vbnm|uiop|qaz|wsx)'
     and lower(btrim(t)) not in ('test', 'testing', 'tester', 'fake', 'fakename', 'none', 'null', 'unknown',
                                 'anonymous', 'idk', 'xxx', 'asdf', 'qwerty', 'name', 'firstname', 'lastname',
                                 'first', 'last', 'abc', 'blah', 'nobody', 'customer', 'user')
     and not public.has_profanity(t)
$$;

-- A US phone number as Supabase Auth stores it: 1 + area code + number, no plus.
-- Returns null for anything that isn't a real-looking US number.
create function public.normalize_phone(p text) returns text
language sql immutable set search_path = ''
as $$
  with d as (
    select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as digits
  ), n as (
    select case
             when char_length(digits) = 10 then '1' || digits
             when char_length(digits) = 11 and left(digits, 1) = '1' then digits
           end as num
    from d
  )
  select case
           when num ~ '^1[2-9][0-8][0-9][2-9][0-9]{6}$'
            and substr(num, 5, 3) !~ '^[2-9]11$'
            and not (substr(num, 5, 3) = '555' and substr(num, 8, 2) = '01')
           then num
         end
  from n
$$;

create function public.is_valid_email(p text) returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null
     and char_length(p) <= 254
     and p ~ '^[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$'
     and p !~ '\.\.'
     and p !~ '^\.'
     and p !~ '\.@'
$$;

-- ---------------------------------------------------------------------
-- Settings (one row). Everything here can be changed later by the admin.
-- ---------------------------------------------------------------------
create table public.business_settings (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'America/Chicago',
  first_start_min int not null default 600,           -- 10:00 AM: earliest start
  last_start_min int not null default 1140,           -- 7:00 PM: latest start
  latest_end_min int not null default 1200,           -- 8:00 PM: no job runs past this
  slot_step_min int not null default 30,              -- start times every 30 minutes
  min_days_ahead int not null default 1,              -- bookable from tomorrow
  max_days_ahead int not null default 60,             -- up to 60 days ahead
  hold_hours int not null default 24,                 -- a new request holds its time this long
  max_shop_jobs int not null default 2,               -- "Come to us": 2 cars in the driveway at once
  max_mobile_jobs int not null default 1,             -- mobile jobs at once
  shop_and_mobile_together boolean not null default false, -- off while the owner is mostly solo
  max_shop_jobs_per_person int not null default 2,    -- one person can work 2 driveway cars at once
  max_mobile_jobs_per_person int not null default 1,  -- or 1 mobile job, never both
  shop_buffer_min int not null default 0,             -- gap after a driveway job (not set yet)
  mobile_buffer_min int not null default 0,           -- travel time after a mobile job (not set yet)
  max_open_requests_per_customer int not null default 3,
  max_requests_per_customer_per_day int not null default 5,
  repeat_window_min int not null default 10,          -- the same request again within this window returns the first one
  require_mfa_for_managers boolean not null default true, -- admin and managers need an authenticator code
  public_phone text not null default '(945) 361-7551',
  public_area text not null default 'Parker, Texas',
  mobile_radius_miles int not null default 10,
  mobile_note text not null default 'For mobile service, we use your outdoor water faucet and a power outlet.',
  shop_address text,                                  -- private: shown only on a customer's own confirmed "Come to us" booking
  updated_at timestamptz not null default now(),
  constraint business_settings_hours_ok check (
        first_start_min >= 0
    and first_start_min <= last_start_min
    and last_start_min < latest_end_min
    and latest_end_min <= 1440
    and slot_step_min between 5 and 240
    and (last_start_min - first_start_min) % slot_step_min = 0),
  constraint business_settings_window_ok check (
    min_days_ahead >= 0 and max_days_ahead >= min_days_ahead and max_days_ahead <= 365),
  constraint business_settings_hold_ok check (hold_hours between 1 and 168),
  constraint business_settings_limits_ok check (
        max_shop_jobs >= 0 and max_mobile_jobs >= 0
    and max_shop_jobs_per_person >= 1 and max_mobile_jobs_per_person >= 1
    and shop_buffer_min between 0 and 240 and mobile_buffer_min between 0 and 240
    and max_open_requests_per_customer >= 1 and max_requests_per_customer_per_day >= 1
    and repeat_window_min between 0 and 1440),
  constraint business_settings_text_ok check (
        char_length(public_phone) between 1 and 40
    and char_length(public_area) between 1 and 80
    and (shop_address is null or char_length(shop_address) <= 300)
    and char_length(mobile_note) between 1 and 300
    and mobile_radius_miles between 1 and 100)
);
comment on table public.business_settings is
  'One row of business rules. Hours, limits and holds decided Oct 3, 2026; buffers are 0 until the owner sets them.';

insert into public.business_settings default values;

create table public.blocked_days (
  day date primary key,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now()
);
comment on table public.blocked_days is 'Days with no bookings (closed). The reason is visible to staff only.';

-- Mobile service area: ZIP codes within about 10 miles of Parker, Texas.
create table public.service_zip_codes (
  zip text primary key check (zip ~ '^[0-9]{5}$'),
  place text not null check (char_length(place) between 1 and 60),
  created_at timestamptz not null default now()
);
comment on table public.service_zip_codes is
  'Mobile jobs are accepted only for these ZIP codes (10-mile radius, decided Oct 3). The admin can add or remove ZIPs.';

-- Throwaway-email services. An email on one of these domains is not accepted.
create table public.blocked_email_domains (
  domain text primary key
    check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z0-9-]{2,}$')
);

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------
create table public.vehicle_types (
  code text primary key check (code ~ '^[a-z][a-z_]{1,29}$'),
  name text not null check (char_length(name) between 1 and 40),
  sort int not null default 0,
  active boolean not null default true
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  kind public.service_kind not null,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 1000),
  base_price_cents int check (base_price_cents is null or base_price_cents >= 0),
  priced_by_vehicle_type boolean not null default false,
  duration_min int check (duration_min is null or duration_min between 5 and 720),
  mobile_pct numeric(5,2) not null default 0 check (mobile_pct between 0 and 100),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_price_source_ok check (
       (priced_by_vehicle_type and base_price_cents is null)
    or (not priced_by_vehicle_type and base_price_cents is not null)),
  constraint services_typed_price_addons_only check (not priced_by_vehicle_type or kind = 'addon')
);
comment on column public.services.code is
  'Stable identifier used by the website. Never reuse or rename a code; retire a service with active = false.';
comment on column public.services.duration_min is
  'Minutes the job takes. Empty means not bookable yet. A bundle''s minutes default to its parts added together.';
comment on column public.services.mobile_pct is
  'Extra percentage on mobile jobs (decided Oct 3: 2.5 for Basic services and add-ons, 7 for Deluxe services and bundles).';

create table public.bundle_parts (
  bundle_id uuid not null references public.services(id) on delete cascade,
  part_id uuid not null references public.services(id),
  primary key (bundle_id, part_id),
  check (bundle_id <> part_id)
);
create index bundle_parts_part_idx on public.bundle_parts (part_id);

-- A service that already includes an add-on (Interior Deluxe includes Steam Cleaning).
create table public.service_includes (
  service_id uuid not null references public.services(id) on delete cascade,
  included_id uuid not null references public.services(id),
  primary key (service_id, included_id),
  check (service_id <> included_id)
);
create index service_includes_included_idx on public.service_includes (included_id);

-- What an add-on needs alongside it.
create table public.addon_rules (
  addon_id uuid primary key references public.services(id) on delete cascade,
  needs text not null check (needs in ('any_main', 'exterior', 'interior'))
);

-- Prices that depend on the vehicle type (the Perfect Finish Sealant).
create table public.service_type_prices (
  service_id uuid not null references public.services(id) on delete cascade,
  vehicle_type text not null references public.vehicle_types(code) on update cascade,
  price_cents int not null check (price_cents >= 0),
  primary key (service_id, vehicle_type)
);
create index service_type_prices_type_idx on public.service_type_prices (vehicle_type);

-- Choices on the booking form. sends_to_review puts the request in the Review
-- lane; holds_price shows no price until the owner sets the extra cost.
create table public.form_options (
  list text not null check (list in ('condition', 'modification', 'damage', 'stain')),
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,40}$'),
  label text not null check (char_length(label) between 1 and 60),
  is_none boolean not null default false,
  sends_to_review boolean not null default false,
  holds_price boolean not null default false,
  requires_note boolean not null default false,
  sort int not null default 0,
  active boolean not null default true,
  primary key (list, code)
);

-- ---------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  first_name text,
  last_name text,
  phone text,          -- copied from Supabase Auth once the text code confirms it
  email text,          -- copied from Supabase Auth once the email code confirms it
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_ok check (first_name is null or public.is_valid_name(first_name)),
  constraint profiles_last_name_ok check (last_name is null or public.is_valid_name(last_name)),
  constraint profiles_phone_ok check (phone is null or phone ~ '^1[2-9][0-9]{9}$'),
  constraint profiles_email_ok check (email is null or public.is_valid_email(email))
);
comment on table public.profiles is
  'One row per login. Every new login starts as a customer; only the admin changes roles.';
create unique index profiles_phone_key on public.profiles (phone) where phone is not null;
create index profiles_staff_idx on public.profiles (role) where role <> 'customer';

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  make text not null,
  model text not null,
  year int,
  color text,
  vehicle_type text not null references public.vehicle_types(code) on update cascade,
  size public.vehicle_size not null default 'standard',
  modifications text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_make_ok check (char_length(btrim(make)) between 1 and 40 and public.is_clean_text(make)),
  constraint vehicles_model_ok check (char_length(btrim(model)) between 1 and 40 and public.is_clean_text(model)),
  constraint vehicles_year_ok check (year is null or year between 1900 and 2100),
  constraint vehicles_color_ok check (color is null or (char_length(color) <= 30 and public.is_clean_text(color))),
  constraint vehicles_mods_ok check (cardinality(modifications) <= 12)
);
create index vehicles_owner_idx on public.vehicles (owner_id);
create index vehicles_type_idx on public.vehicles (vehicle_type);

-- ---------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  request_id uuid,                  -- sent once per booking attempt; a repeat returns the same booking
  contact_first text,               -- required until the booking is anonymized
  contact_last text,
  contact_phone text,               -- required until the booking is anonymized
  contact_email text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_make text,
  vehicle_model text,
  vehicle_year int,
  vehicle_color text,
  vehicle_type text references public.vehicle_types(code) on update cascade,
  vehicle_size public.vehicle_size not null default 'standard',
  vehicle_not_sure boolean not null default false,
  vehicle_description text,
  modifications text[] not null default '{}',
  conditions text[] not null default '{}',
  stains text[] not null default '{}',
  damage text[] not null default '{}',
  damage_note text,
  special_request text,
  photo_paths text[] not null default '{}',
  location_type public.location_type not null,
  address text,
  address_zip text,
  service_date date not null,
  start_min int not null,
  duration_min int not null,
  end_min int generated always as (start_min + duration_min) stored,
  status public.appointment_status not null default 'requested',
  queue public.intake_queue not null default 'requests',
  review_reasons text[] not null default '{}',
  hold_expires_at timestamptz,
  value_cents int not null,          -- menu value of everything chosen, bundles counted as their parts
  bundle_savings_cents int not null default 0,
  mobile_cents int not null default 0,
  price_pending boolean not null default false,  -- true until the owner sets the extra cost (XL, some stains, unpriced sealant)
  pending_reasons text[] not null default '{}',
  extra_cost_cents int,              -- set by the owner only
  extra_cost_note text,
  total_cents int generated always as (
    case when price_pending then null
         else value_cents - bundle_savings_cents + mobile_cents + coalesce(extra_cost_cents, 0) end) stored,
  created_by uuid,
  anonymized_at timestamptz,        -- set when the customer's details are removed (D-12)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_ref_ok check (ref ~ '^AD-[A-HJ-NP-Z2-9]{8}$'),
  constraint appointments_time_ok check (start_min >= 0 and duration_min > 0 and start_min + duration_min <= 1440),
  constraint appointments_location_ok check (
       (location_type = 'mobile' and address_zip ~ '^[0-9]{5}$' and (address is not null or anonymized_at is not null))
    or (location_type = 'shop' and address is null and address_zip is null)),
  constraint appointments_money_ok check (
        value_cents >= 0
    and bundle_savings_cents between 0 and value_cents
    and mobile_cents >= 0
    and (extra_cost_cents is null or extra_cost_cents >= 0)),
  constraint appointments_vehicle_ok check (
       (vehicle_not_sure and (vehicle_description is not null or anonymized_at is not null))
    or (not vehicle_not_sure and vehicle_make is not null and vehicle_model is not null and vehicle_type is not null)),
  constraint appointments_contact_ok check (
       anonymized_at is not null
    or (contact_phone ~ '^1[2-9][0-9]{9}$' and char_length(contact_first) between 1 and 40)),
  constraint appointments_lists_ok check (
        cardinality(photo_paths) <= 6 and cardinality(modifications) <= 12 and cardinality(conditions) <= 15
    and cardinality(stains) <= 10 and cardinality(damage) <= 10),
  constraint appointments_text_ok check (
        coalesce(char_length(vehicle_description), 0) <= 1000
    and coalesce(char_length(damage_note), 0) <= 1000
    and coalesce(char_length(special_request), 0) <= 1000
    and coalesce(char_length(address), 0) <= 300
    and coalesce(char_length(extra_cost_note), 0) <= 500)
);
comment on table public.appointments is
  'Every booking request. Written only through database functions; nothing a browser sends can set a price, a status or a time directly.';
create unique index appointments_request_key on public.appointments (customer_id, request_id) where request_id is not null;
create index appointments_date_idx on public.appointments (service_date)
  where status in ('requested', 'needs_information', 'confirmed', 'in_progress');
create index appointments_customer_idx on public.appointments (customer_id, created_at desc);
create index appointments_status_idx on public.appointments (status, queue);
create index appointments_vehicle_idx on public.appointments (vehicle_id);
create index appointments_vehicle_type_idx on public.appointments (vehicle_type);
create index appointments_photos_idx on public.appointments using gin (photo_paths);

create table public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id),
  code text not null,
  name text not null,
  kind public.service_kind not null,
  price_cents int check (price_cents is null or price_cents >= 0),   -- empty while the owner reviews the price
  mobile_cents int not null default 0 check (mobile_cents >= 0),
  duration_min int not null default 0 check (duration_min >= 0),
  included boolean not null default false,                            -- already part of another service, $0
  sort int not null default 0
);
create index appointment_items_appointment_idx on public.appointment_items (appointment_id);
create index appointment_items_service_idx on public.appointment_items (service_id);

create table public.appointment_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  actor_id uuid,
  from_status public.appointment_status,
  to_status public.appointment_status,
  from_queue public.intake_queue,
  to_queue public.intake_queue,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index appointment_events_appointment_idx on public.appointment_events (appointment_id, created_at);

create table public.appointment_assignments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (appointment_id, employee_id)
);
create index appointment_assignments_employee_idx on public.appointment_assignments (employee_id);
create index appointment_assignments_assigned_by_idx on public.appointment_assignments (assigned_by);

-- A detailer asking to take on a job; a manager or the admin decides.
create table public.job_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  message text check (message is null or char_length(message) <= 500),
  status public.job_request_status not null default 'open',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index job_requests_one_open_idx on public.job_requests (appointment_id, employee_id) where status = 'open';
create index job_requests_appointment_idx on public.job_requests (appointment_id);
create index job_requests_employee_idx on public.job_requests (employee_id);
create index job_requests_decided_by_idx on public.job_requests (decided_by);

-- Any staff member can ask for a review, of a manager or of the admin.
create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  for_admin boolean not null default false,
  message text not null check (char_length(message) between 1 and 1000),
  status public.review_request_status not null default 'open',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  created_at timestamptz not null default now()
);
create index review_requests_appointment_idx on public.review_requests (appointment_id);
create index review_requests_requested_by_idx on public.review_requests (requested_by);
create index review_requests_resolved_by_idx on public.review_requests (resolved_by);
create index review_requests_open_idx on public.review_requests (status) where status = 'open';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 500),
  appointment_id uuid references public.appointments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_appointment_idx on public.notifications (appointment_id);

-- Who changed what. Contact details, addresses and free-text notes are left
-- out, so the log never keeps personal data (F-56).
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- Email check: valid shape, and not a throwaway-email service (subdomains too).
-- ---------------------------------------------------------------------
create function public.email_allowed(p text) returns boolean
language sql stable security definer set search_path = ''
as $$
  with dom as (
    select string_to_array(lower(split_part(p, '@', 2)), '.') as parts
  ), suffixes as (
    select array_to_string(dom.parts[i:], '.') as domain
    from dom, generate_subscripts(dom.parts, 1) as i
  )
  select public.is_valid_email(p)
     and not exists (
       select 1 from suffixes s join public.blocked_email_domains b on b.domain = s.domain)
$$;
