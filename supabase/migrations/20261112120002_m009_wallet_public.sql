-- Test project: 2026-11-12 (version 20261112144612). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 2 of 5 (Nov 12, 2026): the card page's functions (#card and #card-<token>), and small helpers.
--
-- What: wallet_new_card makes an empty card from the printed QR's page (the owner's choice: the first slot is filled at
-- the first wash); wallet_link gives a 10-minute download path for Apple or Google; wallet_card shows the holder's own
-- card; wallet_set_reminders is the holder's on/off switch. Visitors may call these four and nothing else of Migration 009.
-- Why: the owner's Nov 11 request (a QR code that saves a loyalty card into the phone's wallet). Plan 2.2 and 3.2.
-- House rule 5: the page only displays. The flags, caps, formats and voided cards are all checked here again. Nothing a
-- visitor holds (the code, the add token, a download token) can add a stamp: only the owner stamps (part 3).
-- Caps (PROPOSED, settings): 30 new cards an hour and 200 a day from the page, under one lock (advisory 7306, the next
-- free number after 7301-7305). A bot can use them up for an hour, the same trade-off as guest booking; Admin shows it.
-- Tests: db-tests/m009_tests_wallet.sql.

-- ---------------------------------------------------------------- helpers (no API role)
-- A card number as typed, scanned or read out ("k7q2 m9xd", "K7Q2-M9XD") in its stored form, or null.
create or replace function public.wallet_norm_code(p text) returns text
language sql immutable security definer set search_path = ''
as $$
  select case when x ~ '^[A-HJ-NP-Z2-9]{8}$' then x end
  from (select upper(regexp_replace(coalesce(p, ''), '[[:space:]-]', '', 'g')) as x) q
$$;

-- "K7Q2M9XD" as it is printed and read out: "K7Q2 M9XD".
create or replace function public.wallet_code_words(p_code text) returns text
language sql immutable security definer set search_path = ''
as $$
  select substr(p_code, 1, 4) || ' ' || substr(p_code, 5, 4)
$$;

-- "3 of 10", or "12 washes" once past the slots (after 10 the card stays gold and keeps counting: PROPOSED).
create or replace function public.wallet_count_words(p_stamps int, p_slots int) returns text
language sql immutable security definer set search_path = ''
as $$
  select case when p_stamps <= p_slots then p_stamps || ' of ' || p_slots else p_stamps || ' washes' end
$$;

-- The next changed_at: forward by at least a second (Apple's If-Modified-Since is accurate to the second), in whole
-- milliseconds (the update tag is epoch milliseconds, and the Edge Functions' clocks are milliseconds).
create or replace function public.wallet_bump(p_old timestamptz) returns timestamptz
language sql volatile security definer set search_path = ''
as $$
  select date_trunc('milliseconds', greatest(clock_timestamp(), coalesce(p_old, '-infinity'::timestamptz) + interval '1 second'))
$$;

revoke all on function public.wallet_norm_code(text), public.wallet_code_words(text), public.wallet_count_words(int, int),
  public.wallet_bump(timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- a new card
-- p = {request_id, website}. Returns {token, code} (and repeat: true for the same request again).
create or replace function public.wallet_new_card(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_apple boolean;
  v_google boolean;
  v_per_hour int;
  v_per_day int;
  v_phone text;
  v_request uuid;
  v_hour int;
  v_day int;
  c public.wallet_cards;
  v_token text;
  i int;
begin
  select s.wallet_apple_on, s.wallet_google_on, s.wallet_cards_per_hour, s.wallet_cards_per_day, s.public_phone
    into v_apple, v_google, v_per_hour, v_per_day, v_phone
  from public.business_settings s where s.id = 1;
  if not (coalesce(v_apple, false) or coalesce(v_google, false)) then
    perform public.fail('not_allowed', 'Wash cards aren''t available yet.');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.');
  end if;
  -- The hidden field people never see (as in booking).
  if nullif(btrim(coalesce(p ->> 'website', '')), '') is not null then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.', 'website');
  end if;
  v_request := public.try_uuid(p ->> 'request_id');
  if v_request is null then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.', 'request_id');
  end if;

  -- One new card at a time, so the repeat and the caps are exact.
  perform pg_catalog.pg_advisory_xact_lock(7306, 0);

  select * into c from public.wallet_cards x where x.request_id = v_request;
  if found then
    select k.add_token into v_token from public.wallet_card_secrets k where k.card_id = c.id;
    return jsonb_build_object('token', v_token, 'code', c.code, 'repeat', true);
  end if;

  select count(*) filter (where x.created_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day
  from public.wallet_cards x
  where x.source = 'page' and x.created_at > now() - interval '24 hours';
  if v_hour >= v_per_hour or v_day >= v_per_day then
    perform public.fail('too_many_requests',
      'We''re making a lot of cards right now. Please try again later, or call ' || v_phone || '.');
  end if;

  for i in 1..5 loop
    begin
      insert into public.wallet_cards (code, request_id, source)
      values (public.wallet_random_text(8), v_request, 'page')
      returning * into c;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;
  for i in 1..5 loop
    begin
      v_token := public.wallet_random_text(26);
      insert into public.wallet_card_secrets (card_id, add_token, apple_token)
      values (c.id, v_token, public.wallet_random_text(32));
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('token', v_token, 'code', c.code);
end
$$;

-- ---------------------------------------------------------------- a download link
-- p = {token, platform}. Returns {path, expires_at}: "/wallet/apple/d/<dl>" or "/wallet/google/d/<dl>", relative to the
-- Edge Functions' address. The download token lives 10 minutes; a second tap within a minute gets the same one.
create or replace function public.wallet_link(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_platform text;
  v_token text;
  v_apple boolean;
  v_google boolean;
  v_phone text;
  k public.wallet_card_secrets;
  c public.wallet_cards;
  v_dl text;
  i int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.');
  end if;
  v_platform := lower(btrim(coalesce(p ->> 'platform', '')));
  if v_platform not in ('apple', 'google') then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.', 'platform');
  end if;
  select s.wallet_apple_on, s.wallet_google_on, s.public_phone into v_apple, v_google, v_phone
  from public.business_settings s where s.id = 1;
  if v_platform = 'apple' and not coalesce(v_apple, false) then
    perform public.fail('not_allowed', 'Apple Wallet cards aren''t available yet.', 'platform');
  end if;
  if v_platform = 'google' and not coalesce(v_google, false) then
    perform public.fail('not_allowed', 'Google Wallet cards aren''t available yet.', 'platform');
  end if;
  v_token := upper(btrim(coalesce(p ->> 'token', '')));
  if v_token !~ '^[A-HJ-NP-Z2-9]{26}$' then
    perform public.fail('not_found', 'That card wasn''t found.', 'token');
  end if;
  select * into k from public.wallet_card_secrets x where x.add_token = v_token for update;
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'token');
  end if;
  select * into c from public.wallet_cards x where x.id = k.card_id;
  if c.voided_at is not null then
    perform public.fail('wrong_state', 'This card is no longer in use. Please call ' || v_phone || '.');
  end if;

  if k.dl_token is not null and k.dl_platform = v_platform and k.dl_expires_at > now() + interval '9 minutes' then
    v_dl := k.dl_token;
  else
    for i in 1..5 loop
      begin
        v_dl := public.wallet_random_text(26);
        update public.wallet_card_secrets x
           set dl_token = v_dl, dl_platform = v_platform, dl_expires_at = now() + interval '10 minutes'
         where x.card_id = k.card_id
        returning * into k;
        exit;
      exception when unique_violation then
        if i = 5 then raise; end if;
      end;
    end loop;
  end if;
  return jsonb_build_object('path', '/wallet/' || v_platform || '/d/' || v_dl, 'expires_at', k.dl_expires_at);
end
$$;

-- ---------------------------------------------------------------- the holder's own card
-- No names, phones or bookings: the count, the last wash day, where it is saved, and the reminders switch.
create or replace function public.wallet_card(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_token text := upper(btrim(coalesce(p_token, '')));
  c public.wallet_cards;
  v_slots int;
  v_name text;
  v_reminders boolean;
begin
  if v_token !~ '^[A-HJ-NP-Z2-9]{26}$' then
    perform public.fail('not_found', 'That card wasn''t found.', 'token');
  end if;
  select x.* into c from public.wallet_cards x
    join public.wallet_card_secrets k on k.card_id = x.id
   where k.add_token = v_token;
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'token');
  end if;
  select s.wallet_slots, s.wallet_card_name, s.wallet_reminders_on into v_slots, v_name, v_reminders
  from public.business_settings s where s.id = 1;
  return jsonb_build_object(
    'code', c.code,
    'code_words', public.wallet_code_words(c.code),
    'card_name', v_name,
    'stamps', c.stamps,
    'slots', v_slots,
    'member', c.member_since is not null,
    'last_wash_day', c.last_wash_day,
    'reminders_on', v_reminders,
    'reminders_off', c.reminders_off,
    'on_apple', exists (select 1 from public.wallet_apple_registrations r where r.card_id = c.id and r.removed_at is null),
    'on_google', c.google_saved,
    'voided', c.voided_at is not null);
end
$$;

-- The holder's reminders switch. The page asks for a tap first, so a link preview can't change it. Not a change on the
-- card itself, so the wallets aren't updated for it.
create or replace function public.wallet_set_reminders(p_token text, p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_token text := upper(btrim(coalesce(p_token, '')));
  v_id uuid;
begin
  if p_on is null then
    perform public.fail('invalid_input', 'Something went wrong. Please reload the page and try again.', 'on');
  end if;
  if v_token !~ '^[A-HJ-NP-Z2-9]{26}$' then
    perform public.fail('not_found', 'That card wasn''t found.', 'token');
  end if;
  select k.card_id into v_id from public.wallet_card_secrets k where k.add_token = v_token;
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'token');
  end if;
  update public.wallet_cards x set reminders_off = not p_on where x.id = v_id;
  return public.wallet_card(v_token);
end
$$;

revoke all on function public.wallet_new_card(jsonb), public.wallet_link(jsonb), public.wallet_card(text),
  public.wallet_set_reminders(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.wallet_new_card(jsonb), public.wallet_link(jsonb), public.wallet_card(text),
  public.wallet_set_reminders(text, boolean) to anon, authenticated;
comment on function public.wallet_new_card(jsonb) is 'Card page: a new, empty wash card. p = {request_id, website}. Returns {token, code} (Migration 009).';
comment on function public.wallet_link(jsonb) is 'Card page: a 10-minute download path. p = {token, platform: apple | google}. Returns {path, expires_at} (Migration 009).';
comment on function public.wallet_card(text) is 'Card page: the holder''s own card by its add token; nothing personal (Migration 009).';
comment on function public.wallet_set_reminders(text, boolean) is 'Card page: the holder turns reminders on or off (Migration 009).';
