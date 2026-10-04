-- Alchemist Detailing: migration 001 (accounts + booking core)
-- Run ONCE on a fresh Supabase project (SQL Editor, or `supabase db push`).
-- Security model: the browser never writes to booking tables directly. All writes go through
-- the functions below; row level security (RLS) decides who can read what.
-- Deferred to later migrations: payments, refunds, credits, internal notes, review requests, shifts.

-- ---------- types ----------
create type public.user_role as enum ('customer','team_tier_1','team_tier_2','admin');
create type public.appointment_status as enum ('requested','under_review','needs_information','approved','confirmed','in_progress','completed','cancelled','refunded','partially_refunded');
create type public.intake_queue as enum ('requests','review','spam');
create type public.service_kind as enum ('exterior','interior','bundle','plastic','rubber','specialty');

-- ---------- text rules (no links, no emojis) ----------
create function public.is_clean_text(t text) returns boolean language sql immutable as $$
select t is null or (
t !~* '(https?:|www\.|\m[a-z0-9_-]+\.(com|net|org|io|co|app|me|ly|info|xyz|ru|cn|site|shop|link)\M)'
and t !~ '[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]'
) $$;

-- Keyboard mash / one-character values go to the Review queue (lower priority), not Requests.
create function public.looks_like_junk(t text) returns boolean language sql immutable as $$
select t is not null and (char_length(btrim(t)) < 2
or t ~* '(asdf|sdfg|dfgh|qwer|wert|zxcv|xcvb|hjkl|qaz|wsx)' or t ~ '(.)\1{3,}') $$;

-- ---------- tables ----------
create table public.profiles (
id uuid primary key references auth.users(id) on delete cascade,
role public.user_role not null default 'customer',
email text, first_name text, last_name text, phone text,
is_active boolean not null default true,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
deleted_at timestamptz,
constraint profiles_clean check (is_clean_text(first_name) and is_clean_text(last_name))
);

create table public.business_settings (
id int primary key default 1 check (id = 1),
open_min int not null default 600, -- 10:00 AM
close_min int not null default 1140, -- 7:00 PM: every job must FINISH by this time (assumption, change here)
slot_step_min int not null default 30,
capacity int not null default 1, -- simultaneous jobs; raise when you have a team
min_days_ahead int not null default 1,
max_days_ahead int not null default 60,
timezone text not null default 'America/Chicago',
shop_address text, -- shown on the website when set
damage_review_options text[] not null default '{"Paint damage","Dents","Unknown","Other"}', -- damage choices that send a request to Review
updated_at timestamptz not null default now(),
check (open_min < close_min and slot_step_min > 0 and capacity > 0)
);
insert into public.business_settings default values;

create table public.blocked_days (day date primary key, reason text);

create table public.services (
id uuid primary key default gen_random_uuid(),
code text not null unique,
kind public.service_kind not null,
name text not null,
description text,
level int,
price_cents int not null check (price_cents >= 0),
duration_min int not null default 0 check (duration_min >= 0),
ext_code text, int_code text, -- bundles only: the exterior and interior levels they combine
quote_only boolean not null default false, -- specialty work is quoted, never directly bookable
active boolean not null default true,
sort int not null default 0,
updated_at timestamptz not null default now()
);

create table public.vehicles (
id uuid primary key default gen_random_uuid(),
owner_id uuid not null references public.profiles(id),
make text, model text, year text, color text, vehicle_type text, description text,
modifications text[] not null default '{}',
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
deleted_at timestamptz,
constraint vehicles_clean check (is_clean_text(make) and is_clean_text(model) and is_clean_text(year)
and is_clean_text(color) and is_clean_text(description) and is_clean_text(array_to_string(modifications,' ')))
);

create table public.appointments (
id uuid primary key default gen_random_uuid(),
ref text not null unique,
customer_id uuid references public.profiles(id) on delete set null, -- null for guest bookings
contact_first text not null, contact_last text, contact_phone text not null, contact_email text not null,
vehicle_id uuid references public.vehicles(id),
vehicle jsonb not null, -- snapshot of what the customer submitted
conditions text[] not null default '{}',
damage text[] not null default '{"No known damage"}', damage_note text,
review_reasons text[] not null default '{}',
special_request text,
photo_paths text[] not null default '{}',
location_type text not null check (location_type in ('shop','mobile')),
address text,
scheduled_date date not null,
start_min int not null,
duration_min int not null,
end_min int generated always as (start_min + duration_min) stored,
status public.appointment_status not null default 'requested',
queue public.intake_queue not null default 'requests',
service_value_cents int not null, -- original value of everything selected (drives the $200 gold rule)
bundle_savings_cents int not null default 0,
surcharge_cents int not null default 0, -- larger-vehicle surcharge: set by admin once the rules are final
mobile_fee_cents int not null default 0, -- mobile fee: set by admin once pricing is final
final_cents int generated always as (service_value_cents - bundle_savings_cents + surcharge_cents + mobile_fee_cents) stored,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);
create index on public.appointments (scheduled_date) where queue <> 'spam';
create index on public.appointments (customer_id);
create index on public.appointments (status);

create table public.appointment_items (
id uuid primary key default gen_random_uuid(),
appointment_id uuid not null references public.appointments(id) on delete cascade,
service_id uuid references public.services(id),
name text not null, price_cents int not null, duration_min int not null
);

create table public.appointment_events (
id bigint generated always as identity primary key,
appointment_id uuid not null references public.appointments(id) on delete cascade,
actor_id uuid, from_status public.appointment_status, to_status public.appointment_status not null,
note text, -- customer-visible; internal notes arrive in a later migration
created_at timestamptz not null default now()
);

create table public.appointment_assignments (
id uuid primary key default gen_random_uuid(),
appointment_id uuid not null references public.appointments(id) on delete cascade,
employee_id uuid not null references public.profiles(id),
assigned_by uuid references public.profiles(id),
created_at timestamptz not null default now(),
unique (appointment_id, employee_id)
);

create table public.notifications (
id uuid primary key default gen_random_uuid(),
recipient_id uuid not null references public.profiles(id) on delete cascade,
type text not null, title text not null, body text,
related_appointment_id uuid references public.appointments(id) on delete cascade,
read_at timestamptz,
created_at timestamptz not null default now()
);
create index on public.notifications (recipient_id, created_at desc);

create table public.audit_log (
id bigint generated always as identity primary key,
actor_id uuid, action text not null, target_type text, target_id text,
old_value jsonb, new_value jsonb, metadata jsonb,
created_at timestamptz not null default now()
);

-- ---------- role helpers ----------
create function public.app_role() returns public.user_role language sql stable security definer set search_path = public, pg_temp as $$
select role from public.profiles where id = auth.uid() and is_active and deleted_at is null $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
select coalesce(public.app_role() = 'admin', false) $$;
create function public.is_team() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
select coalesce(public.app_role() in ('team_tier_1','team_tier_2'), false) $$;

-- ---------- triggers ----------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.vehicles for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.appointments for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.services for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.business_settings for each row execute function public.touch_updated_at();

-- New sign-ups always become customers. Role is never read from sign-up metadata.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
insert into public.profiles (id, email, first_name, last_name, phone)
values (new.id, new.email,
case when public.is_clean_text(m->>'first_name') then left(m->>'first_name', 60) end,
case when public.is_clean_text(m->>'last_name') then left(m->>'last_name', 60) end,
case when public.is_clean_text(m->>'phone') then left(m->>'phone', 30) end);
return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Status history + notifications. Note text is passed in through a transaction-local setting.
create function public.on_appointment_change() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
if tg_op = 'INSERT' then
insert into public.appointment_events (appointment_id, actor_id, to_status) values (new.id, auth.uid(), new.status);
if new.queue <> 'spam' then
insert into public.notifications (recipient_id, type, title, body, related_appointment_id)
select id, 'new_request', 'New booking request', 'Reference ' || new.ref, new.id
from public.profiles where role = 'admin' and is_active and deleted_at is null;
end if;
if new.customer_id is not null then
insert into public.notifications (recipient_id, type, title, body, related_appointment_id)
values (new.customer_id, 'status_requested', 'Request received', 'Reference ' || new.ref, new.id);
end if;
elsif new.status is distinct from old.status then
insert into public.appointment_events (appointment_id, actor_id, from_status, to_status, note)
values (new.id, auth.uid(), old.status, new.status, nullif(current_setting('ad.note', true), ''));
if new.customer_id is not null then
insert into public.notifications (recipient_id, type, title, body, related_appointment_id)
values (new.customer_id, 'status_' || new.status, 'Appointment ' || replace(new.status::text, '_', ' '), 'Reference ' || new.ref, new.id);
end if;
end if;
return null;
end $$;
create trigger t_appt_change after insert or update on public.appointments for each row execute function public.on_appointment_change();

-- Generic audit trail: who changed what, when, before and after.
create function public.audit_changes() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
if tg_op = 'UPDATE' and o - 'updated_at' = n - 'updated_at' then return null; end if;
insert into public.audit_log (actor_id, action, target_type, target_id, old_value, new_value)
values (auth.uid(), lower(tg_op), tg_table_name, coalesce(coalesce(n, o)->>'id', coalesce(n, o)->>'vehicle_type', coalesce(n, o)->>'day'), o, n);
return null;
end $$;
create trigger t_audit after insert or update or delete on public.profiles for each row execute function public.audit_changes();
create trigger t_audit after insert or update or delete on public.services for each row execute function public.audit_changes();
create trigger t_audit after insert or update or delete on public.business_settings for each row execute function public.audit_changes();
create trigger t_audit after insert or update or delete on public.blocked_days for each row execute function public.audit_changes();
create trigger t_audit after insert or update or delete on public.appointments for each row execute function public.audit_changes();
create trigger t_audit after insert or update or delete on public.appointment_assignments for each row execute function public.audit_changes();

-- ---------- availability ----------
-- Returns the valid start times (minutes after midnight) for a job of p_duration minutes.
create function public.get_availability(p_date date, p_duration int) returns int[] language plpgsql security definer set search_path = public, pg_temp as $$
declare st public.business_settings%rowtype; today date; res int[] := '{}'; m int; n int;
begin
select * into st from public.business_settings where id = 1;
today := (now() at time zone st.timezone)::date;
if p_duration is null or p_duration <= 0 or p_date is null
or p_date < today + st.min_days_ahead or p_date > today + st.max_days_ahead
or exists (select 1 from public.blocked_days where day = p_date) then return res; end if;
m := st.open_min;
while m + p_duration <= st.close_min loop
select count(*) into n from public.appointments a
where a.scheduled_date = p_date and a.queue <> 'spam'
and a.status in ('requested','under_review','needs_information','approved','confirmed','in_progress','completed')
and a.start_min < m + p_duration and a.end_min > m;
if n < st.capacity then res := res || m; end if;
m := m + st.slot_step_min;
end loop;
return res;
end $$;

-- One row per day: is there at least one valid start time? (false = show as fully booked)
create function public.get_calendar(p_from date, p_days int, p_duration int) returns table(day date, available boolean)
language sql security definer set search_path = public, pg_temp as $$
select d::date, cardinality(public.get_availability(d::date, p_duration)) > 0
from generate_series(p_from, p_from + (least(greatest(p_days, 1), 62) - 1), interval '1 day') d $$;

-- ---------- booking ----------
-- payload: {contact:{first_name,last_name,phone,email}, vehicle:{not_sure,make,model,year,color,type,description,
-- modifications[],conditions[],damage,damage_note,photo_paths[]}, vehicle_id?, service:{bundle|exterior,interior,plastic,rubber},
-- special_request, location_type, address, date, start_min, website(honeypot, must be empty)}
create function public.submit_booking(p jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
uid uuid := auth.uid();
c jsonb := coalesce(p->'contact', '{}'); v jsonb := coalesce(p->'vehicle', '{}'); s jsonb := coalesce(p->'service', '{}');
pr public.profiles%rowtype; sv public.vehicles%rowtype;
fn text; ln text; ph text; em text;
not_sure boolean := coalesce(v->>'not_sure', 'false') = 'true';
v_make text := nullif(btrim(v->>'make'), ''); v_model text := nullif(btrim(v->>'model'), '');
v_year text := nullif(btrim(v->>'year'), ''); v_color text := nullif(btrim(v->>'color'), '');
v_type text := nullif(btrim(v->>'type'), ''); v_desc text := nullif(btrim(v->>'description'), '');
v_dmgs text[]; v_dnote text := nullif(btrim(v->>'damage_note'), '');
v_mods text[]; v_conds text[]; v_photos text[];
v_req text := nullif(btrim(p->>'special_request'), '');
loc text := p->>'location_type'; addr text := nullif(btrim(p->>'address'), '');
d date; sm int; vid uuid := nullif(p->>'vehicle_id', '')::uuid;
sb public.services; se public.services; si public.services; spl public.services; srb public.services;
val int := 0; sav int := 0; dur int := 0; q public.intake_queue := 'requests'; aid uuid; r text;
reasons text[] := '{}'; dro text[]; pct numeric := 0; sur int := 0;
begin
-- honeypot: bots fill the hidden field. Pretend success, store nothing, log it.
if nullif(p->>'website', '') is not null then
insert into public.audit_log (action, target_type, metadata) values ('spam_blocked', 'booking', jsonb_build_object('email', left(c->>'email', 120)));
return jsonb_build_object('ref', 'AD-' || upper(substr(md5(random()::text), 1, 6)), 'status', 'requested');
end if;

-- contact: account customers use their stored profile
if uid is not null then select * into pr from public.profiles where id = uid and is_active and deleted_at is null; end if;
fn := left(nullif(btrim(coalesce(pr.first_name, c->>'first_name')), ''), 60);
ln := left(nullif(btrim(coalesce(pr.last_name, c->>'last_name')), ''), 60);
ph := left(nullif(btrim(coalesce(pr.phone, c->>'phone')), ''), 30);
em := left(nullif(btrim(coalesce(pr.email, c->>'email')), ''), 120);
if fn is null then raise exception 'invalid_input: first name is required'; end if;
if ph is null or length(regexp_replace(ph, '\D', '', 'g')) < 10 then raise exception 'invalid_input: a valid phone number is required'; end if;
if em is null or em !~ '^\S+@\S+\.\S+$' then raise exception 'invalid_input: a valid email is required'; end if;

-- vehicle: a saved vehicle (account customers) overrides typed values
if vid is not null then
select * into sv from public.vehicles where id = vid and owner_id = uid and deleted_at is null;
if not found then raise exception 'invalid_input: vehicle not found'; end if;
v_make := sv.make; v_model := sv.model; v_year := sv.year; v_color := sv.color; v_type := sv.vehicle_type; not_sure := false;
v_mods := sv.modifications;
else
select coalesce(array_agg(left(btrim(x), 60)), '{}') into v_mods from jsonb_array_elements_text(coalesce(v->'modifications', '[]')) x;
end if;
select coalesce(array_agg(left(btrim(x), 60)), '{}') into v_conds from jsonb_array_elements_text(coalesce(v->'conditions', '[]')) x;
select coalesce(array_agg(x), '{}') into v_photos from jsonb_array_elements_text(coalesce(v->'photo_paths', '[]')) x;
select coalesce(array_agg(distinct btrim(x)), '{}') into v_dmgs from jsonb_array_elements_text(case jsonb_typeof(v->'damage') when 'array' then v->'damage' else '[]'::jsonb end) x;
if cardinality(v_dmgs) = 0 then v_dmgs := array['No known damage']; end if;
if cardinality(v_mods) > 12 or cardinality(v_conds) > 15 or cardinality(v_photos) > 6 then raise exception 'invalid_input: too many selections'; end if;
if cardinality(v_photos) > 0 and (uid is null or exists (select 1 from unnest(v_photos) f where f not like uid::text || '/%' or f like '%..%')) then
raise exception 'invalid_input: photos need a signed-in account'; end if;
if not_sure then
if v_desc is null then raise exception 'invalid_input: describe your vehicle'; end if;
elsif v_make is null or v_model is null then raise exception 'invalid_input: make and model are required';
end if;
if v_type is not null and v_type not in ('Sedan','Coupe','SUV','Truck','Minivan','Crossover','Convertible','Van','Other') then raise exception 'invalid_input: vehicle type'; end if;
if exists (select 1 from unnest(v_dmgs) dm where dm not in ('No known damage','Exterior damage','Interior damage','Paint damage','Scratches','Dents','Unknown','Other'))
or (cardinality(v_dmgs) > 1 and 'No known damage' = any (v_dmgs)) then raise exception 'invalid_input: damage option'; end if;

-- text rules: no links, no emojis, sane lengths
if not (public.is_clean_text(fn) and public.is_clean_text(ln) and public.is_clean_text(v_make) and public.is_clean_text(v_model)
and public.is_clean_text(v_year) and public.is_clean_text(v_color) and public.is_clean_text(v_desc) and public.is_clean_text(v_dnote)
and public.is_clean_text(v_req) and public.is_clean_text(addr) and public.is_clean_text(array_to_string(v_mods || v_conds, ' '))) then
raise exception 'invalid_input: links and emojis are not allowed in text fields'; end if;
if greatest(char_length(coalesce(v_desc, '')), char_length(coalesce(v_dnote, '')), char_length(coalesce(v_req, '')), char_length(coalesce(addr, ''))) > 1000 then
raise exception 'invalid_input: text is too long'; end if;

-- location
if loc not in ('shop','mobile') then raise exception 'invalid_input: choose shop or mobile'; end if;
if loc = 'mobile' and addr is null then raise exception 'invalid_input: service address is required for mobile service'; end if;
if loc = 'shop' then addr := null; end if;

-- services: prices and durations always come from the catalog, never from the browser
if nullif(s->>'bundle', '') is not null then
if nullif(s->>'exterior', '') is not null or nullif(s->>'interior', '') is not null then raise exception 'invalid_input: choose a bundle or individual levels, not both'; end if;
select * into sb from public.services where code = s->>'bundle' and kind = 'bundle' and active and not quote_only;
if not found then raise exception 'invalid_input: unknown bundle'; end if;
select * into se from public.services where code = sb.ext_code; select * into si from public.services where code = sb.int_code;
val := se.price_cents + si.price_cents; sav := val - sb.price_cents; dur := se.duration_min + si.duration_min;
else
if nullif(s->>'exterior', '') is not null then
select * into se from public.services where code = s->>'exterior' and kind = 'exterior' and active and not quote_only;
if not found then raise exception 'invalid_input: unknown exterior level'; end if;
val := val + se.price_cents; dur := dur + se.duration_min;
end if;
if nullif(s->>'interior', '') is not null then
select * into si from public.services where code = s->>'interior' and kind = 'interior' and active and not quote_only;
if not found then raise exception 'invalid_input: unknown interior level'; end if;
val := val + si.price_cents; dur := dur + si.duration_min;
end if;
if se.id is null and si.id is null then raise exception 'invalid_input: choose a service'; end if;
end if;
if nullif(s->>'plastic', '') is not null then
select * into spl from public.services where code = s->>'plastic' and kind = 'plastic' and active and not quote_only;
if not found then raise exception 'invalid_input: unknown plastic care option'; end if;
val := val + spl.price_cents; dur := dur + spl.duration_min;
end if;
if nullif(s->>'rubber', '') is not null then
select * into srb from public.services where code = s->>'rubber' and kind = 'rubber' and active and not quote_only;
if not found then raise exception 'invalid_input: unknown rubber care option'; end if;
val := val + srb.price_cents; dur := dur + srb.duration_min;
end if;

-- slot: serialize per day, then re-check availability inside the same transaction (no double booking)
d := (p->>'date')::date; sm := (p->>'start_min')::int;
perform pg_advisory_xact_lock(hashtext('ad_booking:' || d::text));
if sm is null or not (sm = any (public.get_availability(d, dur))) then raise exception 'slot_unavailable'; end if;

-- triage: unidentifiable vehicles go to the lower-priority Review queue
if public.looks_like_junk(v_make) or public.looks_like_junk(v_model) or (not_sure and public.looks_like_junk(v_desc)) then q := 'review'; reasons := array_append(reasons, 'unclear_vehicle'); end if;
select damage_review_options into dro from public.business_settings where id = 1;
if v_dmgs && dro then q := 'review'; reasons := array_append(reasons, 'damage'); end if;
-- larger-vehicle adjustment comes from vehicle_size_rules, never from the browser
select surcharge_pct into pct from public.vehicle_size_rules where vehicle_type = coalesce(v_type, 'Other');
sur := round((val - sav) * coalesce(pct, 0) / 100.0)::int;
