-- Test project: 2026-11-12 (version 20261112144535). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 1 of 5 (Nov 12, 2026): the wallet wash card's settings, tables and random codes.
--
-- What: a card customers save in Apple Wallet or Google Wallet from a printed QR code. 10 slots, one per wash; at 10
-- the card turns gold and says "Loyalty member". Parts: 1 settings and tables (this file), 2 the card page's functions,
-- 3 stamping (Admin and the SQL Editor), 4 the functions the Edge Functions call, 5 the update call and schedules
-- (pg_net, pg_cron, Vault; built with the Edge Functions, not here).
-- Why: the owner's request of Nov 11 and his answers of Nov 11-12 (to record as doc 53). Plan: wallet plan version 2.
-- Owner decisions:
--   - Build our own, no hosted service. 10 slots, one per wash; at 10 the card turns gold, "Loyalty member". The perk is
--     decided later: nothing here names a reward. (This replaces docs 21/22's "loyalty: do not build" for the card itself.)
--   - "Issued by" shows the name, Parker, Texas and (945) 361-7551. Apple's terms also want an address and an email; the
--     owner will get a mailbox or PO box and a business email. Until both are set (wallet_issuer_address and
--     wallet_issuer_email) Apple can't be switched on: the constraint business_settings_wallet_apple_contact refuses it.
--     That address is never the owner's home (house rule 6): business_settings_wallet_not_home refuses a copy of it.
--   - Reminders: one 4 weeks after the last wash, at most one more 4 weeks later, then quiet until the next wash; one 14
--     days after the card is added when there's no wash yet; daytime only (Parker's clock). Built but off
--     (wallet_reminders_on = false, and no wording) until he approves the words at launch.
-- PROPOSED (the lead's defaults; each is a setting or a rule that is easy to change): every completed booking is one slot
--   (two cars, two bookings, two slots); after 10 the card stays gold and keeps counting; the card comes from the printed
--   QR, empty; stamp and gold notices continue when a holder turns reminders off (wallet_quiet_mutes_stamps = false); the
--   card's name is "Wash card" (wallet_card_name); nothing personal on the card; separate from the Gold client ($200+)
--   rule; at most 30 new cards an hour and 200 a day from the page; a completed booking can fill a slot for 60 days;
--   push codes are blanked 30 days after no card is on that device.
-- Build rules (plan 3.0): security definer with an empty search_path; explicit revoke and grant; row level security on
--   with no policies and no grants (not even to service_role: everything goes through functions); only wallet_stamps is
--   audited (the tokens live in wallet_card_secrets, which has no trigger); random text from gen_random_uuid() bytes.
-- Tests: db-tests/m009_tests_wallet.sql.

-- ---------------------------------------------------------------- settings
alter table public.business_settings
  add column if not exists wallet_apple_on boolean not null default false,
  add column if not exists wallet_google_on boolean not null default false,
  add column if not exists wallet_slots int not null default 10,
  add column if not exists wallet_card_name text not null default 'Wash card',
  add column if not exists wallet_issuer_address text,
  add column if not exists wallet_issuer_email text,
  add column if not exists wallet_site_url text,
  add column if not exists wallet_cards_per_hour int not null default 30,
  add column if not exists wallet_cards_per_day int not null default 200,
  add column if not exists wallet_stamp_days int not null default 60,
  add column if not exists wallet_reminders_on boolean not null default false,
  add column if not exists wallet_reminder_first_days int not null default 28,
  add column if not exists wallet_reminder_again_days int not null default 28,
  add column if not exists wallet_reminders_per_gap int not null default 2,
  add column if not exists wallet_reminder_new_days int default 14,
  add column if not exists wallet_reminder_from_min int not null default 600,
  add column if not exists wallet_reminder_until_min int not null default 1140,
  add column if not exists wallet_reminder_after_text text,
  add column if not exists wallet_reminder_new_text text,
  add column if not exists wallet_quiet_mutes_stamps boolean not null default false,
  add column if not exists wallet_push_blank_days int not null default 30,
  add column if not exists wallet_apple_cert_expires date;

alter table public.business_settings add constraint business_settings_wallet_ok check (
      wallet_slots between 1 and 20
  and char_length(btrim(wallet_card_name)) between 1 and 20
  and (wallet_issuer_address is null or char_length(btrim(wallet_issuer_address)) between 5 and 200)
  and (wallet_issuer_email is null or (char_length(wallet_issuer_email) <= 254   -- is_valid_email's pattern, inline: a check
       and wallet_issuer_email ~ '^[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$'
       and wallet_issuer_email !~ '\.\.'))                                       -- runs as the admin, who can't call functions
  and (wallet_site_url is null or wallet_site_url ~ '^https://[a-z0-9.-]+$')
  and wallet_cards_per_hour between 1 and 500
  and wallet_cards_per_day between 1 and 5000
  and wallet_stamp_days between 1 and 366
  and wallet_reminder_first_days between 7 and 365
  and wallet_reminder_again_days between 7 and 365
  and wallet_reminders_per_gap between 0 and 3
  and (wallet_reminder_new_days is null or wallet_reminder_new_days between 3 and 365)
  and wallet_reminder_from_min between 480 and 1200
  and wallet_reminder_until_min between wallet_reminder_from_min + 30 and 1260
  and (wallet_reminder_after_text is null or char_length(btrim(wallet_reminder_after_text)) between 1 and 120)
  and (wallet_reminder_new_text is null or char_length(btrim(wallet_reminder_new_text)) between 1 and 120)
  and wallet_push_blank_days between 1 and 365);
-- Apple stays off until the mailbox (or PO box) and the business email are on file (the owner, Nov 11-12).
alter table public.business_settings add constraint business_settings_wallet_apple_contact check (
  not wallet_apple_on or (wallet_issuer_address is not null and wallet_issuer_email is not null));
-- The card's address is never the owner's home (house rule 6): the same letters and digits as the private address are refused.
alter table public.business_settings add constraint business_settings_wallet_not_home check (
  wallet_issuer_address is null or shop_address is null
  or lower(regexp_replace(wallet_issuer_address, '[^A-Za-z0-9]', '', 'g'))
     <> lower(regexp_replace(shop_address, '[^A-Za-z0-9]', '', 'g')));

comment on column public.business_settings.wallet_apple_on is 'Apple Wallet cards offered. Refused while wallet_issuer_address or wallet_issuer_email is empty (Migration 009).';
comment on column public.business_settings.wallet_google_on is 'Google Wallet cards offered (Migration 009).';
comment on column public.business_settings.wallet_slots is 'Slots on the wash card; the card turns gold ("Loyalty member") when this many washes are stamped (the owner, Nov 11: 10).';
comment on column public.business_settings.wallet_card_name is 'The card''s name on the page and in the wallets (PROPOSED "Wash card"; at most 20 characters for Google).';
comment on column public.business_settings.wallet_issuer_address is 'The mailbox or PO box on the back of the card ("Issued by"). Never the owner''s home. Empty = Apple stays off.';
comment on column public.business_settings.wallet_issuer_email is 'The business email on the back of the card. Empty = Apple stays off.';
comment on column public.business_settings.wallet_site_url is 'This project''s website, for the holder''s link in office.card (for example https://thealchemistdetailing.com). Optional.';
comment on column public.business_settings.wallet_stamp_days is 'How many days after its day a completed booking can still fill a slot (PROPOSED 60).';
comment on column public.business_settings.wallet_reminders_on is 'Reminders sent at all. Off until the owner approves the wording (Nov 11-12).';
comment on column public.business_settings.wallet_reminder_after_text is 'The reminder after a wash, as the owner approved it (at most 120 characters; no reward, no "text us"). Empty = none sent.';
comment on column public.business_settings.wallet_reminder_new_text is 'The one reminder to a card with no wash yet, as the owner approved it. Empty = none sent.';
comment on column public.business_settings.wallet_quiet_mutes_stamps is 'When a holder turns reminders off, also silence "wash stamped" and "loyalty member" notices (PROPOSED false).';

-- A new column needs its own grant to be readable by staff (doc 46, Migration 008). Visitors read get_public_settings().
grant select (wallet_apple_on, wallet_google_on, wallet_slots, wallet_card_name, wallet_issuer_address, wallet_issuer_email,
              wallet_site_url, wallet_cards_per_hour, wallet_cards_per_day, wallet_stamp_days, wallet_reminders_on,
              wallet_reminder_first_days, wallet_reminder_again_days, wallet_reminders_per_gap, wallet_reminder_new_days,
              wallet_reminder_from_min, wallet_reminder_until_min, wallet_reminder_after_text, wallet_reminder_new_text,
              wallet_quiet_mutes_stamps, wallet_push_blank_days, wallet_apple_cert_expires)
  on table public.business_settings to authenticated;

-- ---------------------------------------------------------------- tables
-- The card. Nothing personal: a code, a count, dates. No trigger: nothing secret, and its sync bookkeeping changes often.
create table public.wallet_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),  -- Apple serial, Google object suffix, under the QR; not secret
  request_id uuid unique,                     -- the card page's attempt: a repeat returns this card
  source text not null default 'page' check (source in ('page', 'staff')),
  created_by uuid,
  created_at timestamptz not null default now(),
  first_added_at timestamptz,                 -- first Apple registration, or first seen saved at Google
  stamps int not null default 0 check (stamps >= 0),  -- always the number of live rows in wallet_stamps
  member_since timestamptz,                   -- set when stamps reach wallet_slots; cleared if a take-back leaves fewer
  last_wash_day date,                         -- the latest live stamp's day
  last_change text not null default 'new'
    check (last_change in ('new', 'stamp', 'member', 'unstamp', 'reminder', 'void', 'resign')),
  last_notice_at timestamptz,                 -- the latest change that notifies the holder (stamp, member, reminder)
  reminders_off boolean not null default false,  -- the holder's switch on the card page
  reminders_sent int not null default 0 check (reminders_sent >= 0),  -- reminders after a wash since the latest wash
  last_reminder_at timestamptz,
  new_reminder_at timestamptz,                -- the one reminder before a first wash; never sent twice
  reminder_text text check (reminder_text is null or char_length(reminder_text) <= 160),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (void_reason is null or char_length(void_reason) between 1 and 300),
  changed_at timestamptz not null default date_trunc('milliseconds', now()),  -- moves forward on every change a holder can see
  apple_synced_at timestamptz,
  google_synced_at timestamptz,
  google_object_id text unique,
  google_issued_at timestamptz,               -- the latest Google save link made for it
  google_saved boolean not null default false,
  constraint wallet_cards_void check ((voided_at is null) = (void_reason is null))
);
create index wallet_cards_pending_idx on public.wallet_cards (changed_at)
  where apple_synced_at is distinct from changed_at or google_synced_at is distinct from changed_at;
create index wallet_cards_created_idx on public.wallet_cards (created_at desc);
comment on table public.wallet_cards is 'Wallet wash cards (Migration 009). Nothing personal. Read and written only through the wallet_* functions.';

-- The secrets live apart (review B1): no trigger, no grants, ever.
create table public.wallet_card_secrets (
  card_id uuid primary key references public.wallet_cards(id),
  add_token text not null unique check (add_token ~ '^[A-HJ-NP-Z2-9]{26}$'),    -- the holder's page, #card-<token>
  apple_token text not null check (apple_token ~ '^[A-HJ-NP-Z2-9]{32}$'),       -- Apple's authenticationToken
  dl_token text unique check (dl_token is null or dl_token ~ '^[A-HJ-NP-Z2-9]{26}$'),  -- 10-minute download token
  dl_platform text check (dl_platform is null or dl_platform in ('apple', 'google')),
  dl_expires_at timestamptz
);
comment on table public.wallet_card_secrets is 'The card''s tokens (Migration 009). Never audited, never granted to an API role.';

-- One row per wash. The only audited wallet table: the owner's Log shows stamps and take-backs. "reason" and
-- "resolution" (the take-back reason) are on audit_changes()'s hidden list, so free text never reaches the log (F-56).
create table public.wallet_stamps (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.wallet_cards(id),
  appointment_id uuid references public.appointments(id),
  day date not null,                          -- Parker's date of the wash
  reason text check (reason is null or char_length(reason) between 1 and 300),
  stamped_by uuid,                            -- null = the owner in the SQL Editor
  created_at timestamptz not null default now(),
  removed_at timestamptz,                     -- taken back (never removed from the table)
  removed_by uuid,
  resolution text check (resolution is null or char_length(resolution) between 1 and 300),
  constraint wallet_stamps_why check (appointment_id is not null or reason is not null),
  constraint wallet_stamps_removed check ((removed_at is null) = (resolution is null))
);
create unique index wallet_stamps_one_per_booking on public.wallet_stamps (appointment_id)
  where appointment_id is not null and removed_at is null;
create unique index wallet_stamps_one_manual_a_day on public.wallet_stamps (card_id, day)
  where appointment_id is null and removed_at is null;
create index wallet_stamps_card_idx on public.wallet_stamps (card_id, created_at desc);
create trigger wallet_stamps_audit after insert or update on public.wallet_stamps
  for each row execute function public.audit_changes();
comment on table public.wallet_stamps is 'One row per wash on a wash card; a take-back sets removed_at (Migration 009).';

-- Apple's suggested tables for its web service.
create table public.wallet_apple_devices (
  device_id text primary key check (device_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  push_token text check (push_token is null or (push_token ~ '^[0-9A-Fa-f]+$' and char_length(push_token) between 32 and 256)),  -- null once blanked
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz                    -- the device's latest "which passes changed?" call
);
create table public.wallet_apple_registrations (
  device_id text not null references public.wallet_apple_devices(device_id),
  card_id uuid not null references public.wallet_cards(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_why text check (removed_why is null or removed_why in ('unregistered', 'apns_gone')),
  primary key (device_id, card_id),
  constraint wallet_apple_registrations_removed check ((removed_at is null) = (removed_why is null))
);
create index wallet_apple_registrations_card_idx on public.wallet_apple_registrations (card_id) where removed_at is null;

-- What was sent, for the caps and the owner's list.
create table public.wallet_reminders (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.wallet_cards(id),
  sent_at timestamptz not null default now(),
  kind text not null check (kind in ('after_wash', 'before_first')),
  apple_devices int not null default 0 check (apple_devices >= 0),
  google boolean not null default false,
  body text not null check (char_length(body) <= 160)
);
create index wallet_reminders_card_idx on public.wallet_reminders (card_id, sent_at desc);

-- Apple or Google errors that stopped a sync run; shown in Admin.
create table public.wallet_sync_problems (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  platform text not null check (platform in ('apple', 'google', 'setup')),
  code text not null check (char_length(code) between 1 and 80),
  detail text check (detail is null or char_length(detail) <= 300),
  resolved_at timestamptz
);

alter table public.wallet_cards enable row level security;
alter table public.wallet_card_secrets enable row level security;
alter table public.wallet_stamps enable row level security;
alter table public.wallet_apple_devices enable row level security;
alter table public.wallet_apple_registrations enable row level security;
alter table public.wallet_reminders enable row level security;
alter table public.wallet_sync_problems enable row level security;
revoke all on table public.wallet_cards, public.wallet_card_secrets, public.wallet_stamps, public.wallet_apple_devices,
  public.wallet_apple_registrations, public.wallet_reminders, public.wallet_sync_problems
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- random text
-- The new_booking_ref() pattern: bytes of gen_random_uuid() (pg_strong_random in PostgreSQL 17), skipping bytes 6 and 8,
-- which carry the version and variant bits. Each byte mod 32 picks one of 32 symbols (no I, O, 0 or 1), 5 random bits
-- each: 8 symbols = 40 bits (the card code), 26 = 130 bits (the add and download tokens), 32 = 160 bits (Apple's token).
create or replace function public.wallet_random_text(p_len int) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  idx constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15];
  b bytea;
  r text := '';
  i int;
begin
  if p_len is null or p_len < 1 or p_len > 64 then
    perform public.fail('invalid_input', 'A length from 1 to 64.');
  end if;
  while char_length(r) < p_len loop
    b := uuid_send(gen_random_uuid());
    foreach i in array idx loop
      exit when char_length(r) >= p_len;
      r := r || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
  end loop;
  return r;
end
$$;
revoke all on function public.wallet_random_text(int) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- the card page's settings
-- get_public_settings() from its Migration 005 text, plus the wallet keys the card page needs. Nothing else changes.
create or replace function public.get_public_settings()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'timezone', s.timezone,
    'first_start_min', s.first_start_min,
    'last_start_min', s.last_start_min,
    'latest_end_min', s.latest_end_min,
    'slot_step_min', s.slot_step_min,
    'min_days_ahead', s.min_days_ahead,
    'max_days_ahead', s.max_days_ahead,
    'hold_hours', s.hold_hours,
    'public_phone', s.public_phone,
    'public_area', s.public_area,
    'mobile_radius_miles', s.mobile_radius_miles,
    'mobile_note', s.mobile_note,
    'customer_notice', s.customer_notice,
    'google_reviews_url', s.google_reviews_url,
    'guest_booking', s.guest_booking,
    'weekly_closures', (select coalesce(jsonb_agg(jsonb_build_object('weekday', w.weekday, 'start_min', w.start_min, 'end_min', w.end_min)
                                                  order by w.weekday, w.start_min), '[]'::jsonb)
                        from public.weekly_closures w),
    'wallet_apple_on', s.wallet_apple_on,
    'wallet_google_on', s.wallet_google_on,
    'wallet_slots', s.wallet_slots,
    'wallet_card_name', s.wallet_card_name,
    'wallet_reminders_on', s.wallet_reminders_on)
  from public.business_settings s
  where s.id = 1
$function$;
