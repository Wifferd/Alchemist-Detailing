-- Test project: 2026-11-12 (version 20261112172452). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 5b of 5 (Nov 12, 2026): the update call and the schedules (plan 3.5).
--
-- What:
--   - wallet_sync_card(card): the card as the pass and the Google object show it, without its tokens, plus whether each
--     wallet lags (service_role only; the wallet-sync Edge Function reads it, parts 1-4 had no way to read a card by id).
--   - A trigger on wallet_cards: when changed_at moves (a stamp, a take-back, gold, a reminder, a void, a new
--     certificate), queue one call to wallet-sync/sync {card} through pg_net. pg_net queues the call as a row and a
--     background worker sends it after the commit, so a stamp that rolls back sends nothing. A failed queueing never
--     blocks the stamp (a warning only); the sweep catches up.
--   - The schedules (pg_cron): wallet-sync-sweep every 10 minutes, calling wallet-sync/sweep only when a card lags or a
--     Google save link of the last 7 days isn't seen saved; wallet-reminders daily at 16:07 UTC (10:07 AM in Parker in
--     winter, 11:07 AM in summer), only while wallet_reminders_on is true (off until the owner approves the wording);
--     wallet-tidy weekly, blanking push codes after 30 days with no card on that iPhone (an update, not a removal).
--   - office.wallet_setup(step, body) and office.wallet_setup_result(id) for the SQL Editor: the Apple key and
--     certificate setup (apple-csr, apple-cert), google-setup, sweep and tidy. The key is made inside wallet-sync and
--     kept in Vault; only the CSR (public) comes back.
-- Needs: the extensions (part 5a) and two Vault entries, made in the SQL Editor without anyone seeing the secret:
--     select vault.create_secret(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'hex'), 'wallet_sync_secret');
--     select vault.create_secret('https://<project ref>.supabase.co/functions/v1/wallet-sync', 'wallet_sync_url');
--   Without pg_net or either entry the call does nothing, so the rest of Migration 009 works on a project without them.
--   Without pg_cron the schedules are skipped (apply this part again once it is on).
-- Why: the owner's Nov 11-12 decisions (the card updates after a stamp; reminders built but off). Plan 3.5, 4.4, 4.6.
-- The pg_cron run history grows (about 150 rows a day here); clearing it is a later owner-run tidy-up, not this part.
-- Tests: db-tests/m009_tests_sync.sql.

-- ---------------------------------------------------------------- the card for the sync (service_role)
create or replace function public.wallet_sync_card(p_card uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'card_id', c.id,
    'code', c.code,
    'code_words', public.wallet_code_words(c.code),
    'card_name', s.wallet_card_name,
    'stamps', c.stamps,
    'slots', s.wallet_slots,
    'count_words', public.wallet_count_words(c.stamps, s.wallet_slots),
    'member', c.member_since is not null,
    'member_since', c.member_since,
    'last_wash_day', c.last_wash_day,
    'last_change', c.last_change,
    'notify', case when c.last_change in ('stamp', 'member') then not (c.reminders_off and s.wallet_quiet_mutes_stamps)
                   when c.last_change = 'reminder' then c.reminder_text is not null
                   else false end,
    'reminder_text', c.reminder_text,
    'voided', c.voided_at is not null,
    'changed_at', c.changed_at,
    'changed_at_ms', (extract(epoch from c.changed_at) * 1000)::bigint,
    'google_object_id', c.google_object_id,
    'google_saved', c.google_saved,
    'issuer', jsonb_build_object('area', s.public_area, 'phone', s.public_phone,
                                 'address', s.wallet_issuer_address, 'email', s.wallet_issuer_email),
    'site_url', s.wallet_site_url,
    'apple_on', s.wallet_apple_on,
    'google_on', s.wallet_google_on,
    'apple_pending', c.apple_synced_at is distinct from c.changed_at,
    'google_pending', c.google_synced_at is distinct from c.changed_at)
  from public.wallet_cards c
  cross join (select x.wallet_card_name, x.wallet_slots, x.wallet_quiet_mutes_stamps, x.public_area, x.public_phone,
                     x.wallet_issuer_address, x.wallet_issuer_email, x.wallet_site_url, x.wallet_apple_on,
                     x.wallet_google_on
                from public.business_settings x where x.id = 1) s
  where c.id = p_card
$$;

-- ---------------------------------------------------------------- the call to wallet-sync (no API role)
-- Queues POST <wallet_sync_url>/<step> with the Vault secret in x-wallet-secret and a 30-second timeout (a cold
-- function with Google and APNs can take longer than pg_net's default 5). Returns the pg_net request id, or null when
-- pg_net or either Vault entry is missing. The secret is read here, inside the database, and only sent to wallet-sync.
create or replace function public.wallet_call(p_step text, p_body jsonb default '{}'::jsonb) returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  if p_step is null or p_step !~ '^[a-z][a-z-]{1,30}$' then
    perform public.fail('invalid_input', 'A wallet-sync step name.', 'step');
  end if;
  if not exists (select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace
                  where n.nspname = 'net' and f.proname = 'http_post') then
    return null;
  end if;
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'wallet_sync_url'
   order by d.updated_at desc limit 1;
  select d.decrypted_secret into v_secret from vault.decrypted_secrets d where d.name = 'wallet_sync_secret'
   order by d.updated_at desc limit 1;
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    return null;
  end if;
  select net.http_post(
           url := rtrim(v_url, '/') || '/' || p_step,
           body := coalesce(p_body, '{}'::jsonb),
           headers := jsonb_build_object('content-type', 'application/json', 'x-wallet-secret', v_secret),
           timeout_milliseconds := 30000)
    into v_id;
  return v_id;
end
$$;

-- The trigger: one call per change a holder can see. Never blocks the change itself.
create or replace function public.wallet_card_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform public.wallet_call('sync', jsonb_build_object('card', new.id));
  exception when others then
    raise warning 'wallet: the update call for card % was not queued (%)', new.code, sqlstate;
  end;
  return null;
end
$$;

create or replace trigger wallet_cards_sync
  after update of changed_at on public.wallet_cards
  for each row when (new.changed_at is distinct from old.changed_at)
  execute function public.wallet_card_changed();

-- ---------------------------------------------------------------- the schedules' work (no API role)
create or replace function public.wallet_sweep_due() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.wallet_cards c
                  where c.apple_synced_at is distinct from c.changed_at
                     or c.google_synced_at is distinct from c.changed_at
                     or (c.google_issued_at > now() - interval '7 days' and not c.google_saved))
$$;

-- Every 10 minutes: call the sweep only when something lags (most runs send nothing).
create or replace function public.wallet_sweep_tick() returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if public.wallet_sweep_due() then
    return public.wallet_call('sweep', '{}'::jsonb);
  end if;
  return null;
end
$$;

-- Daily: the reminders run, only while the owner has them on.
create or replace function public.wallet_reminders_tick() returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if coalesce((select s.wallet_reminders_on from public.business_settings s where s.id = 1), false) then
    return public.wallet_call('reminders', '{}'::jsonb);
  end if;
  return null;
end
$$;

revoke all on function public.wallet_sync_card(uuid) from public, anon, authenticated, service_role;
grant execute on function public.wallet_sync_card(uuid) to service_role;
revoke all on function public.wallet_call(text, jsonb), public.wallet_card_changed(), public.wallet_sweep_due(),
  public.wallet_sweep_tick(), public.wallet_reminders_tick()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- setup from the SQL Editor
-- select office.wallet_setup('apple-csr');            then, a few seconds later:
-- select office.wallet_setup_result(<the number it gave>);   the CSR (public) to upload to Apple
-- select office.wallet_setup('apple-cert', '-----BEGIN CERTIFICATE-----...');   the certificate Apple issued
-- Also: 'google-setup', 'sweep', 'tidy'.
create or replace function office.wallet_setup(p_step text, p_body text default null) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_step is null or p_step not in ('apple-csr', 'apple-cert', 'google-setup', 'sweep', 'tidy') then
    raise exception 'The steps are apple-csr, apple-cert, google-setup, sweep and tidy.';
  end if;
  if p_step = 'apple-cert' and coalesce(p_body, '') !~ 'BEGIN CERTIFICATE' then
    raise exception 'apple-cert needs the certificate, as text starting -----BEGIN CERTIFICATE-----.';
  end if;
  v_id := public.wallet_call(p_step, case when p_body is null then '{}'::jsonb else jsonb_build_object('pem', p_body) end);
  if v_id is null then
    raise exception 'Not set up: pg_net, or the Vault entries wallet_sync_url and wallet_sync_secret, are missing.';
  end if;
  return v_id;
end
$$;

create or replace function office.wallet_setup_result(p_id bigint) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  select x.status_code, x.content, x.timed_out, x.error_msg into r from net._http_response x where x.id = p_id;
  if not found then
    return 'No answer yet: try again in a few seconds.';
  end if;
  if r.timed_out then
    return 'The call timed out.';
  end if;
  if r.error_msg is not null then
    return 'The call failed: ' || r.error_msg;
  end if;
  return r.status_code || E'\n' || coalesce(r.content, '');
end
$$;

revoke all on function office.wallet_setup(text, text), office.wallet_setup_result(bigint)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- the schedules (pg_cron; skipped without it)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('wallet-sync-sweep', '*/10 * * * *', 'select public.wallet_sweep_tick()');
    perform cron.schedule('wallet-reminders', '7 16 * * *', 'select public.wallet_reminders_tick()');
    perform cron.schedule('wallet-tidy', '17 9 * * 0', 'select public.wallet_blank_old_push_tokens()');
  else
    raise notice 'pg_cron is off: the wallet schedules were not made.';
  end if;
end
$$;
