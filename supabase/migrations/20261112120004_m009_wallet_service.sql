-- Test project: 2026-11-12 (version 20261112144849). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 4 of 5 (Nov 12, 2026): the functions the two Edge Functions call ("wallet": the download routes
-- and Apple's web service; "wallet-sync": pushes, Google updates, reminders, certificate setup). service_role only.
--
-- Apple's web service (plan 4.2): register answers 201 new, 200 already there, 401 wrong token, 400 malformed; at most 10
-- live registrations per card (above that: 200 and nothing stored). Apple's unregister call marks the registration
-- removed (nothing is ever removed from a table). "Which passes changed?" uses changed_at as epoch milliseconds, with a
-- 10-second overlap so a change committed a moment late is never missed (a device then fetches one pass twice, and gets
-- 304 or the same pass). Only APNs answers 410 Unregistered / ExpiredToken mark a registration gone (wallet_apple_gone).
-- The pass data includes the card's tokens (the pass needs them), so it is for service_role only.
-- Flags (house rule 5): wallet_pass_data returns null while that platform is off, so no pass is served then. Apple
-- can't be on while the mailbox or business email is missing (part 1), so no pass ships without them.
-- Reminders (the owner, Nov 11-12; off until he approves the wording): one wallet_reminder_first_days (28) after the
-- last wash, at most wallet_reminders_per_gap (2) in all, the next wallet_reminder_again_days (28) after the one before;
-- one wallet_reminder_new_days (14) after the card was added when it has no wash, never twice; only between
-- wallet_reminder_from_min and wallet_reminder_until_min on Parker's clock (10 AM to 7 PM, the business's hours); never
-- to a voided card, a card whose holder turned reminders off, a card on no wallet, a card that had a notice today, or a
-- card whose customer (same phone or account as a stamped booking) has a booking coming up.
-- Vault (plan 4.6): wallet_vault_get reads only the four wallet names; wallet_vault_put writes only the Apple key and
-- certificate names. No test or tool ever reads a value; values are made and used inside Supabase.
-- Tests: db-tests/m009_tests_wallet.sql.

-- ---------------------------------------------------------------- building a pass or a Google object
-- By download token (the download routes; p_platform = the route's platform), or by code and Apple token (Apple's
-- "send an updated pass"). Null when a token is wrong or expired, the card is voided (download only), or the
-- platform is off.
create or replace function public.wallet_pass_data(p_dl text default null, p_code text default null, p_auth text default null,
                                                   p_platform text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  k public.wallet_card_secrets;
  c public.wallet_cards;
  st record;
  v_platform text;
  v_dl text := upper(btrim(coalesce(p_dl, '')));
  v_code text := public.wallet_norm_code(p_code);
  v_auth text := btrim(coalesce(p_auth, ''));
begin
  select s.wallet_apple_on, s.wallet_google_on, s.wallet_slots, s.wallet_card_name, s.public_phone, s.public_area,
         s.wallet_issuer_address, s.wallet_issuer_email, s.wallet_site_url, s.wallet_quiet_mutes_stamps
    into st
  from public.business_settings s where s.id = 1;
  if v_dl <> '' then
    if v_dl !~ '^[A-HJ-NP-Z2-9]{26}$' then return null; end if;
    select * into k from public.wallet_card_secrets x where x.dl_token = v_dl and x.dl_expires_at > now();
    if not found then return null; end if;
    v_platform := k.dl_platform;
    select * into c from public.wallet_cards x where x.id = k.card_id;
    if c.voided_at is not null then return null; end if;
  elsif v_code is not null then
    if v_auth !~ '^[A-HJ-NP-Z2-9]{32}$' then return null; end if;
    select * into c from public.wallet_cards x where x.code = v_code;
    if not found then return null; end if;
    select * into k from public.wallet_card_secrets x where x.card_id = c.id;
    if k.apple_token is distinct from v_auth then return null; end if;
    v_platform := 'apple';
  else
    return null;
  end if;
  if p_platform is not null and p_platform is distinct from v_platform then return null; end if;
  if (v_platform = 'apple' and not st.wallet_apple_on) or (v_platform = 'google' and not st.wallet_google_on) then
    return null;
  end if;
  return jsonb_build_object(
    'card_id', c.id,
    'code', c.code,
    'code_words', public.wallet_code_words(c.code),
    'platform', v_platform,
    'card_name', st.wallet_card_name,
    'stamps', c.stamps,
    'slots', st.wallet_slots,
    'count_words', public.wallet_count_words(c.stamps, st.wallet_slots),
    'member', c.member_since is not null,
    'member_since', c.member_since,
    'last_wash_day', c.last_wash_day,
    'last_change', c.last_change,
    -- whether this change should show a notice: stamps and gold unless the holder silenced everything (Q-6c setting),
    -- and a reminder's own text
    'notify', case when c.last_change in ('stamp', 'member') then not (c.reminders_off and st.wallet_quiet_mutes_stamps)
                   when c.last_change = 'reminder' then c.reminder_text is not null
                   else false end,
    'reminder_text', c.reminder_text,
    'voided', c.voided_at is not null,
    'changed_at', c.changed_at,
    'changed_at_ms', (extract(epoch from c.changed_at) * 1000)::bigint,
    'add_token', k.add_token,
    'apple_token', k.apple_token,
    'google_object_id', c.google_object_id,
    'google_saved', c.google_saved,
    'issuer', jsonb_build_object('area', st.public_area, 'phone', st.public_phone,
                                 'address', st.wallet_issuer_address, 'email', st.wallet_issuer_email),
    'site_url', st.wallet_site_url);
end
$$;

-- ---------------------------------------------------------------- Apple's web service
create or replace function public.wallet_apple_register(p_device text, p_push text, p_code text, p_auth text) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_card uuid;
  v_token text;
  r public.wallet_apple_registrations;
  v_had boolean;
  n int;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9._-]{1,128}$' or p_push is null or p_push !~ '^[0-9A-Fa-f]+$'
     or char_length(p_push) not between 32 and 256 then
    return 400;
  end if;
  select x.id into v_card from public.wallet_cards x where x.code = public.wallet_norm_code(p_code) for update;
  if not found then return 401; end if;
  select k.apple_token into v_token from public.wallet_card_secrets k where k.card_id = v_card;
  if p_auth is null or v_token is distinct from p_auth then return 401; end if;

  select * into r from public.wallet_apple_registrations x where x.device_id = p_device and x.card_id = v_card;
  v_had := found;
  if v_had and r.removed_at is null then
    update public.wallet_apple_devices d set push_token = p_push, updated_at = now()
     where d.device_id = p_device and d.push_token is distinct from p_push;
    return 200;
  end if;
  select count(*) into n from public.wallet_apple_registrations x where x.card_id = v_card and x.removed_at is null;
  if n >= 10 then
    return 200;   -- the cap: answered as if registered, nothing stored
  end if;
  insert into public.wallet_apple_devices (device_id, push_token) values (p_device, p_push)
  on conflict (device_id) do update set push_token = excluded.push_token, updated_at = now();
  if v_had then
    update public.wallet_apple_registrations x set removed_at = null, removed_why = null
     where x.device_id = p_device and x.card_id = v_card;
  else
    insert into public.wallet_apple_registrations (device_id, card_id) values (p_device, v_card);
  end if;
  update public.wallet_cards x set first_added_at = coalesce(x.first_added_at, now()) where x.id = v_card;
  return 201;
end
$$;

-- Apple's unregister call (the pass was removed from the phone, or its updates turned off).
create or replace function public.wallet_apple_unregister(p_device text, p_code text, p_auth text) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_card uuid;
  v_token text;
begin
  select x.id into v_card from public.wallet_cards x where x.code = public.wallet_norm_code(p_code);
  if not found then return 401; end if;
  select k.apple_token into v_token from public.wallet_card_secrets k where k.card_id = v_card;
  if p_auth is null or v_token is distinct from p_auth then return 401; end if;
  update public.wallet_apple_registrations x set removed_at = now(), removed_why = 'unregistered'
   where x.device_id = p_device and x.card_id = v_card and x.removed_at is null;
  return 200;
end
$$;

-- "Which passes changed?" {serialNumbers, lastUpdated}, or null for 204. p_since is the lastUpdated the device was
-- given before (epoch milliseconds, as text); without it, every card registered on the device.
create or replace function public.wallet_apple_changed(p_device text, p_since text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_since timestamptz;
  r jsonb;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9._-]{1,128}$' then return null; end if;
  update public.wallet_apple_devices d set last_seen_at = now() where d.device_id = p_device;
  if not found then return null; end if;
  if btrim(coalesce(p_since, '')) ~ '^[0-9]{1,15}$' then
    v_since := timestamptz 'epoch' + btrim(p_since)::bigint * interval '1 millisecond' - interval '10 seconds';
  end if;
  select jsonb_build_object('serialNumbers', jsonb_agg(c.code order by c.code),
                            'lastUpdated', (max(extract(epoch from c.changed_at) * 1000))::bigint::text)
    into r
  from public.wallet_apple_registrations x
  join public.wallet_cards c on c.id = x.card_id
  where x.device_id = p_device and x.removed_at is null and (v_since is null or c.changed_at > v_since)
  having count(*) > 0;
  return r;
end
$$;

-- The push tokens of a card's live registrations, for the pushes after a change.
create or replace function public.wallet_apple_targets(p_card uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct d.push_token), '[]'::jsonb)
  from public.wallet_apple_registrations x
  join public.wallet_apple_devices d on d.device_id = x.device_id
  where x.card_id = p_card and x.removed_at is null and d.push_token is not null
$$;

-- APNs answered 410 Unregistered or 410 ExpiredToken for this push token: its registrations are gone. Nothing else
-- removes a registration (a 400 or 403 is a setup problem: wallet_problem).
create or replace function public.wallet_apple_gone(p_push text) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n int;
begin
  update public.wallet_apple_registrations x set removed_at = now(), removed_why = 'apns_gone'
   where x.removed_at is null
     and x.device_id in (select d.device_id from public.wallet_apple_devices d where d.push_token = p_push);
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------- sync bookkeeping
-- A problem that stopped a sync run, for Admin (wallet_list). No personal data in the detail.
create or replace function public.wallet_problem(p_platform text, p_code text, p_detail text default null) returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.wallet_sync_problems (platform, code, detail)
  values (case when p_platform in ('apple', 'google', 'setup') then p_platform else 'setup' end,
          left(coalesce(nullif(btrim(p_code), ''), 'unknown'), 80),
          left(nullif(btrim(coalesce(p_detail, '')), ''), 300))
  returning id into v_id;
  return v_id;
end
$$;

-- Cards that lag on a platform, oldest change first, plus Google links made in the last 7 days and not seen saved.
create or replace function public.wallet_pending(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('card_id', q.id, 'code', q.code, 'changed_at', q.changed_at,
           'changed_at_ms', (extract(epoch from q.changed_at) * 1000)::bigint,
           'apple', q.apple_synced_at is distinct from q.changed_at,
           'google', q.google_synced_at is distinct from q.changed_at,
           'google_check', q.google_issued_at > now() - interval '7 days' and not q.google_saved,
           'google_object_id', q.google_object_id) order by q.changed_at), '[]'::jsonb)
  from (select * from public.wallet_cards c
         where c.apple_synced_at is distinct from c.changed_at or c.google_synced_at is distinct from c.changed_at
            or (c.google_issued_at > now() - interval '7 days' and not c.google_saved)
         order by c.changed_at
         limit least(greatest(coalesce(p_limit, 50), 1), 500)) q
$$;

-- A platform is up to date with the card as of p_changed_at (the changed_at the run read). Called even when there was
-- nothing to send, so a card on no wallet stops being pending. Returns whether that platform is now in step.
create or replace function public.wallet_synced(p_card uuid, p_platform text, p_changed_at timestamptz) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
begin
  if p_platform is null or p_platform not in ('apple', 'google') then
    perform public.fail('invalid_input', 'Platform apple or google.', 'platform');
  end if;
  select * into c from public.wallet_cards x where x.id = p_card for update;
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'card');
  end if;
  if p_changed_at is null or p_changed_at > c.changed_at then
    perform public.fail('invalid_input', 'That time is newer than the card''s latest change.', 'changed_at');
  end if;
  update public.wallet_cards x
     set apple_synced_at = case when p_platform = 'apple' and (x.apple_synced_at is null or p_changed_at > x.apple_synced_at)
                                then p_changed_at else x.apple_synced_at end,
         google_synced_at = case when p_platform = 'google' and (x.google_synced_at is null or p_changed_at > x.google_synced_at)
                                 then p_changed_at else x.google_synced_at end
   where x.id = p_card
  returning * into c;
  return case when p_platform = 'apple' then c.apple_synced_at = c.changed_at else c.google_synced_at = c.changed_at end;
end
$$;

-- Google: a save link was made for this object (<issuer id>.<code>).
create or replace function public.wallet_google_issued(p_code text, p_object_id text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_object_id is null or p_object_id !~ '^[0-9]{6,25}\.[A-Za-z0-9._-]{1,100}$' then
    perform public.fail('invalid_input', 'A Google object id is <issuer id>.<suffix>.', 'object_id');
  end if;
  update public.wallet_cards x set google_object_id = p_object_id, google_issued_at = now()
   where x.code = public.wallet_norm_code(p_code);
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'code');
  end if;
  return true;
end
$$;

-- Google: the object is (or isn't) saved in someone's wallet. The first save counts as the card being added.
create or replace function public.wallet_google_saved(p_code text, p_saved boolean) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_saved is null then
    perform public.fail('invalid_input', 'Saved true or false.', 'saved');
  end if;
  update public.wallet_cards x
     set google_saved = p_saved,
         first_added_at = case when p_saved then coalesce(x.first_added_at, now()) else x.first_added_at end
   where x.code = public.wallet_norm_code(p_code);
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'code');
  end if;
  return p_saved;
end
$$;

-- ---------------------------------------------------------------- reminders (off until the owner approves the words)
-- The reminders due at p_now (no API role). p_daytime false skips the time-of-day window (wallet_reminded re-checks a
-- card that the daytime run listed).
create or replace function public.wallet_due_list(p_now timestamptz, p_card uuid, p_daytime boolean)
returns table (card_id uuid, code text, kind text, body text, apple_devices int, google boolean, google_object_id text)
language sql stable security definer set search_path = ''
as $$
  with st as (
    select s.timezone, s.wallet_reminders_on as on_, s.wallet_reminder_first_days as first_days,
           s.wallet_reminder_again_days as again_days, s.wallet_reminders_per_gap as per_gap,
           s.wallet_reminder_new_days as new_days, s.wallet_reminder_from_min as from_min,
           s.wallet_reminder_until_min as until_min, s.wallet_reminder_after_text as after_text,
           s.wallet_reminder_new_text as new_text,
           (p_now at time zone s.timezone)::date as today,
           (extract(hour from p_now at time zone s.timezone) * 60 + extract(minute from p_now at time zone s.timezone))::int as minute
    from public.business_settings s where s.id = 1)
  select c.id, c.code, k.kind,
         case k.kind when 'after_wash' then btrim(st.after_text) else btrim(st.new_text) end,
         dv.n, c.google_saved and c.google_object_id is not null, c.google_object_id
  from public.wallet_cards c
  cross join st
  cross join lateral (select count(*)::int as n from public.wallet_apple_registrations r
                       where r.card_id = c.id and r.removed_at is null) dv
  cross join lateral (select case
      when c.stamps > 0 and c.last_wash_day is not null and st.after_text is not null and c.reminders_sent < st.per_gap
       and st.today >= case when c.reminders_sent = 0 or c.last_reminder_at is null then c.last_wash_day + st.first_days
                            else (c.last_reminder_at at time zone st.timezone)::date + st.again_days end
        then 'after_wash'
      when c.stamps = 0 and st.new_days is not null and st.new_text is not null and c.new_reminder_at is null
       and c.first_added_at is not null and st.today >= (c.first_added_at at time zone st.timezone)::date + st.new_days
        then 'before_first'
    end as kind) k
  where st.on_
    and (not p_daytime or (st.minute >= st.from_min and st.minute < st.until_min))
    and (p_card is null or c.id = p_card)
    and k.kind is not null
    and c.voided_at is null
    and not c.reminders_off
    and (dv.n > 0 or c.google_saved)
    and (c.last_notice_at is null or (c.last_notice_at at time zone st.timezone)::date < st.today)
    and not exists (
      select 1
        from public.wallet_stamps ls
        join public.appointments b on b.id = ls.appointment_id
       where ls.card_id = c.id and ls.removed_at is null
         and exists (select 1 from public.appointments o
                      where o.status in ('requested', 'needs_information', 'confirmed', 'in_progress')
                        and o.service_date >= st.today
                        and ((b.contact_phone is not null and o.contact_phone = b.contact_phone)
                          or (b.customer_id is not null and o.customer_id = b.customer_id))))
$$;

-- The daily run's list: [{card_id, code, kind, text, apple_devices, google, google_object_id}].
create or replace function public.wallet_due_reminders(p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('card_id', d.card_id, 'code', d.code, 'kind', d.kind, 'text', d.body,
           'apple_devices', d.apple_devices, 'google', d.google, 'google_object_id', d.google_object_id) order by d.code), '[]'::jsonb)
  from public.wallet_due_list(coalesce(p_now, now()), null, true) d
$$;

-- A reminder goes out: the card carries its text (the pass's reminder field), moves changed_at so part 5 pushes it, and
-- the send is recorded. Refused when it isn't due (so a repeated call sends nothing twice) or the text isn't the
-- approved wording. p_apple and p_google record what the run reached.
create or replace function public.wallet_reminded(p_card uuid, p_kind text, p_text text default null, p_apple int default 0,
                                                  p_google boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
  v_body text;
begin
  if p_kind is null or p_kind not in ('after_wash', 'before_first') then
    perform public.fail('invalid_input', 'Kind after_wash or before_first.', 'kind');
  end if;
  select * into c from public.wallet_cards x where x.id = p_card for update;
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'card');
  end if;
  select d.body into v_body from public.wallet_due_list(now(), p_card, false) d where d.kind = p_kind;
  if not found then
    perform public.fail('wrong_state', 'That reminder isn''t due.', 'kind');
  end if;
  if p_text is not null and btrim(p_text) <> v_body then
    perform public.fail('invalid_input', 'The text isn''t the approved wording.', 'text');
  end if;
  update public.wallet_cards x
     set reminder_text = v_body,
         last_change = 'reminder',
         changed_at = public.wallet_bump(x.changed_at),
         last_notice_at = now(),
         last_reminder_at = now(),
         reminders_sent = x.reminders_sent + case when p_kind = 'after_wash' then 1 else 0 end,
         new_reminder_at = case when p_kind = 'before_first' then now() else x.new_reminder_at end
   where x.id = c.id
  returning * into c;
  insert into public.wallet_reminders (card_id, kind, apple_devices, google, body)
  values (c.id, p_kind, greatest(coalesce(p_apple, 0), 0), coalesce(p_google, false), v_body);
  return jsonb_build_object('code', c.code, 'kind', p_kind, 'text', v_body, 'changed_at', c.changed_at,
                            'changed_at_ms', (extract(epoch from c.changed_at) * 1000)::bigint);
end
$$;

-- ---------------------------------------------------------------- Vault and the Apple certificate
-- Values are read and written only here, by name; nothing ever selects them through a tool.
create or replace function public.wallet_vault_get(p_name text) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_name is null or p_name not in ('wallet_sync_secret', 'wallet_apple_key', 'wallet_apple_key_next', 'wallet_apple_cert') then
    return null;
  end if;
  return (select d.decrypted_secret from vault.decrypted_secrets d where d.name = p_name order by d.updated_at desc limit 1);
end
$$;

create or replace function public.wallet_vault_put(p_name text, p_value text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name is null or p_name not in ('wallet_apple_key_next', 'wallet_apple_key', 'wallet_apple_cert') then
    perform public.fail('invalid_input', 'Only the Apple key and certificate names can be written.', 'name');
  end if;
  if p_value is null or char_length(p_value) < 1 or char_length(p_value) > 49152 then
    perform public.fail('invalid_input', 'An empty or oversized value.', 'value');
  end if;
  select s.id into v_id from vault.secrets s where s.name = p_name;
  if found then
    perform vault.update_secret(v_id, p_value);
  else
    perform vault.create_secret(p_value, p_name);
  end if;
  return true;
end
$$;

-- A new Apple certificate is in Vault (first one, renewal, or after a leak): its expiry for Admin, and every card that
-- can still be on a phone moves forward so each registered phone fetches a pass signed with it (plan 4.7).
create or replace function public.wallet_cert_installed(p_expires date) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n int;
begin
  if p_expires is null or p_expires < public.local_today() then
    perform public.fail('invalid_input', 'The certificate''s expiry date, in the future.', 'expires');
  end if;
  update public.business_settings s set wallet_apple_cert_expires = p_expires where s.id = 1;
  update public.wallet_cards c set last_change = 'resign', changed_at = public.wallet_bump(c.changed_at)
   where c.voided_at is null
      or exists (select 1 from public.wallet_apple_registrations r where r.card_id = c.id and r.removed_at is null);
  get diagnostics n = row_count;
  return n;
end
$$;

-- PROPOSED privacy step (plan 7): blank the push token of a device that has had no card on it for p_days
-- (default wallet_push_blank_days, 30). An update: the device row stays, its token is gone.
create or replace function public.wallet_blank_old_push_tokens(p_days int default null) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_days int;
  n int;
begin
  v_days := coalesce(p_days, (select s.wallet_push_blank_days from public.business_settings s where s.id = 1), 30);
  if v_days < 1 then
    perform public.fail('invalid_input', 'At least one day.', 'days');
  end if;
  update public.wallet_apple_devices d set push_token = null, updated_at = now()
   where d.push_token is not null
     and not exists (select 1 from public.wallet_apple_registrations r where r.device_id = d.device_id and r.removed_at is null)
     and coalesce((select max(r.removed_at) from public.wallet_apple_registrations r where r.device_id = d.device_id), d.created_at)
         < now() - make_interval(days => v_days);
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.wallet_due_list(timestamptz, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function
  public.wallet_pass_data(text, text, text, text), public.wallet_apple_register(text, text, text, text),
  public.wallet_apple_unregister(text, text, text), public.wallet_apple_changed(text, text),
  public.wallet_apple_targets(uuid), public.wallet_apple_gone(text), public.wallet_problem(text, text, text),
  public.wallet_pending(int), public.wallet_synced(uuid, text, timestamptz), public.wallet_google_issued(text, text),
  public.wallet_google_saved(text, boolean), public.wallet_due_reminders(timestamptz),
  public.wallet_reminded(uuid, text, text, int, boolean), public.wallet_vault_get(text), public.wallet_vault_put(text, text),
  public.wallet_cert_installed(date), public.wallet_blank_old_push_tokens(int)
  from public, anon, authenticated, service_role;
grant execute on function
  public.wallet_pass_data(text, text, text, text), public.wallet_apple_register(text, text, text, text),
  public.wallet_apple_unregister(text, text, text), public.wallet_apple_changed(text, text),
  public.wallet_apple_targets(uuid), public.wallet_apple_gone(text), public.wallet_problem(text, text, text),
  public.wallet_pending(int), public.wallet_synced(uuid, text, timestamptz), public.wallet_google_issued(text, text),
  public.wallet_google_saved(text, boolean), public.wallet_due_reminders(timestamptz),
  public.wallet_reminded(uuid, text, text, int, boolean), public.wallet_vault_get(text), public.wallet_vault_put(text, text),
  public.wallet_cert_installed(date), public.wallet_blank_old_push_tokens(int)
  to service_role;
