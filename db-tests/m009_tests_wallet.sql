-- Migration 009 (Nov 12, 2026): the wallet wash card. Parts 1-4:
--   part 1 (20261112120001): settings, the seven wallet tables, wallet_random_text, get_public_settings;
--   part 2 (20261112120002): the card page (wallet_new_card, wallet_link, wallet_card, wallet_set_reminders);
--   part 3 (20261112120003): stamping (wallet_stamp, wallet_unstamp, wallet_find, wallet_waiting, wallet_list,
--          wallet_void) and the SQL Editor (office.stamp, office.unstamp, office.card, office.cards, office.waiting);
--   part 4 (20261112120004): the Edge Functions' functions (service_role only).
-- Needs the m001 framework and fixtures (test project only) and the migrations applied. Five DO blocks, each one query
-- through the Supabase MCP (top-level "set role" hangs there: roles are switched with execute 'set local role ...').
-- Every check that writes runs inside a block that is rolled back at its end, so nothing it makes is kept and it can
-- run again; the answers are kept in a variable and recorded at the end of each block. Earlier results are relabelled
-- "old ...". No token, push code or Vault value is ever shown: checks compare them inside the database and record only
-- true or false. Vault values are never read. The owner's address is never read: an error on the settings row records
-- only its SQLSTATE (a check failure's detail lists the row).
-- 170 checks (setup 40, cards 23, stamps 57, service 30, reminders 20), all passing on the test project on
-- 2026-11-12 (parts 1-4 at versions 20261112144535, 20261112144612, 20261112144737, 20261112144849), and on a local
-- PostgreSQL 16 copy built from the migration files. Part 5 (the update call, pg_net, pg_cron, Vault) has its own checks.
-- Read the results with:
--   select label, passed, detail from tst.results where label like 'm009 %' order by id;

-- ==================================================================== 1. setup: grants, tables, settings, random text
do $$
declare
  p text := 'm009 setup';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  res jsonb := '[]';
  r jsonb;
  v text;
  v_state text;
  v_err text;
  v_b boolean;
  n int;
  arr text[];
  toks text[];
  tabs text[] := array['wallet_cards', 'wallet_card_secrets', 'wallet_stamps', 'wallet_apple_devices',
                       'wallet_apple_registrations', 'wallet_reminders', 'wallet_sync_problems'];
  want_anon text[] := array['wallet_card', 'wallet_link', 'wallet_new_card', 'wallet_set_reminders'];
  want_auth text[] := array['wallet_card', 'wallet_find', 'wallet_link', 'wallet_list', 'wallet_new_card',
                            'wallet_set_reminders', 'wallet_stamp', 'wallet_unstamp', 'wallet_void', 'wallet_waiting'];
  want_svc text[] := array['wallet_apple_changed', 'wallet_apple_gone', 'wallet_apple_register', 'wallet_apple_targets',
                           'wallet_apple_unregister', 'wallet_blank_old_push_tokens', 'wallet_cert_installed',
                           'wallet_due_reminders', 'wallet_google_issued', 'wallet_google_saved', 'wallet_pass_data',
                           'wallet_pending', 'wallet_problem', 'wallet_reminded', 'wallet_synced', 'wallet_vault_get',
                           'wallet_vault_put'];
  wcols text[] := array['wallet_apple_on', 'wallet_google_on', 'wallet_slots', 'wallet_card_name', 'wallet_issuer_address',
    'wallet_issuer_email', 'wallet_site_url', 'wallet_cards_per_hour', 'wallet_cards_per_day', 'wallet_stamp_days',
    'wallet_reminders_on', 'wallet_reminder_first_days', 'wallet_reminder_again_days', 'wallet_reminders_per_gap',
    'wallet_reminder_new_days', 'wallet_reminder_from_min', 'wallet_reminder_until_min', 'wallet_reminder_after_text',
    'wallet_reminder_new_text', 'wallet_quiet_mutes_stamps', 'wallet_push_blank_days', 'wallet_apple_cert_expires'];
begin
  update tst.results set label = 'old ' || label where label like p || ':%';

  -- ---------------------------------------------------------------- tables
  select array_agg(c.relname::text order by c.relname) into arr
  from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid in (select ('public.' || t)::regclass from unnest(tabs) t)
    and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole);
  res := res || jsonb_build_array(jsonb_build_array(p || ': no API role (visitors, signed-in users, service_role, PUBLIC) holds any right on a wallet table',
    arr is null, coalesce(arr::text, 'none')));
  select array_agg(att.attrelid::regclass::text || '.' || att.attname order by 1) into arr
  from pg_attribute att
  where att.attrelid in (select ('public.' || t)::regclass from unnest(tabs) t) and att.attacl is not null;
  res := res || jsonb_build_array(jsonb_build_array(p || ': and no column rights either', arr is null, coalesce(arr::text, 'none')));
  select count(*) into n from pg_class c where c.oid in (select ('public.' || t)::regclass from unnest(tabs) t) and c.relrowsecurity;
  res := res || jsonb_build_array(jsonb_build_array(p || ': row level security is on for all seven tables', n = 7, n::text));
  select count(*) into n from pg_policy pl where pl.polrelid in (select ('public.' || t)::regclass from unnest(tabs) t);
  res := res || jsonb_build_array(jsonb_build_array(p || ': and they have no policies (everything goes through functions)', n = 0, n::text));
  select array_agg(c.relname || '.' || tg.tgname || ':' || tg.tgtype order by tg.tgname) into arr
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
  where tg.tgrelid in (select ('public.' || t)::regclass from unnest(tabs) t) and not tg.tgisinternal;
  res := res || jsonb_build_array(jsonb_build_array(p || ': only wallet_stamps has a trigger: the audit, after insert or update, per row',
    arr = array['wallet_stamps.wallet_stamps_audit:21']
    and (select tg.tgfoid = 'public.audit_changes()'::regprocedure from pg_trigger tg where tg.tgname = 'wallet_stamps_audit'),
    coalesce(arr::text, 'none')));
  select array_agg(q.x) into arr
  from (values ('wallet_cards', 'code'), ('wallet_cards', 'request_id'), ('wallet_cards', 'google_object_id'),
               ('wallet_card_secrets', 'add_token'), ('wallet_card_secrets', 'dl_token')) as u(t, col)
  cross join lateral (select u.t || '.' || u.col as x) q
  where not exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                     where i.indrelid = ('public.' || u.t)::regclass and i.indisunique and i.indnatts = 1
                       and i.indpred is null and a.attname = u.col);
  res := res || jsonb_build_array(jsonb_build_array(p || ': card codes, request ids, Google objects, add tokens and download tokens are unique',
    arr is null, coalesce(arr::text, 'all unique')));
  res := res || jsonb_build_array(jsonb_build_array(p || ': one live stamp per booking, one stamp without a booking per card per day',
    (select bool_and(i.indisunique and i.indpred is not null) from pg_index i
      where i.indexrelid in ('public.wallet_stamps_one_per_booking'::regclass, 'public.wallet_stamps_one_manual_a_day'::regclass)), null));

  -- ---------------------------------------------------------------- functions
  select array_agg(f.proname::text order by f.proname) filter (where has_function_privilege('anon', f.oid, 'execute')),
         array_agg(f.proname::text order by f.proname) filter (where has_function_privilege('authenticated', f.oid, 'execute'))
    into toks, arr
  from (select x.oid, x.proname from pg_proc x where x.pronamespace = 'public'::regnamespace and x.proname like 'wallet%') f;
  res := res || jsonb_build_array(jsonb_build_array(p || ': visitors may call only wallet_new_card, wallet_link, wallet_card and wallet_set_reminders',
    toks = want_anon, coalesce(toks::text, 'none')));
  res := res || jsonb_build_array(jsonb_build_array(p || ': signed-in users get those plus the owner''s six (each checks for the admin itself)',
    arr = want_auth, coalesce(arr::text, 'none')));
  select array_agg(f.proname::text order by f.proname) into arr
  from pg_proc f where f.pronamespace = 'public'::regnamespace and f.proname like 'wallet%'
    and has_function_privilege('service_role', f.oid, 'execute');
  res := res || jsonb_build_array(jsonb_build_array(p || ': service_role gets exactly the Edge Functions'' seventeen',
    arr = want_svc, coalesce(arr::text, 'none')));
  select array_agg(f.proname::text order by f.proname) into arr
  from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
  where (f.pronamespace = 'public'::regnamespace and f.proname like 'wallet%'
         or f.oid in ('office.stamp(text, text, text, date)'::regprocedure, 'office.unstamp(text, text)'::regprocedure,
                      'office.card(text)'::regprocedure))
    and a.grantee = 0;
  res := res || jsonb_build_array(jsonb_build_array(p || ': no wallet function is open to PUBLIC', arr is null, coalesce(arr::text, 'none')));
  select array_agg(f.proname::text order by f.proname) into arr
  from pg_proc f where f.pronamespace = 'public'::regnamespace
    and f.proname in ('wallet_random_text', 'wallet_norm_code', 'wallet_code_words', 'wallet_count_words', 'wallet_bump',
                      'wallet_card_info', 'wallet_stamp_do', 'wallet_unstamp_do', 'wallet_waiting_list', 'wallet_due_list')
    and (has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute')
         or has_function_privilege('service_role', f.oid, 'execute'));
  res := res || jsonb_build_array(jsonb_build_array(p || ': the inner functions (stamp and take-back work, random text, the due list) are closed to every API role',
    arr is null, coalesce(arr::text, 'none')));
  select array_agg(f.oid::regprocedure::text order by f.proname) into arr
  from pg_proc f
  where (f.pronamespace = 'public'::regnamespace and f.proname like 'wallet%' or f.pronamespace = 'office'::regnamespace and f.proname in ('stamp', 'unstamp', 'card'))
    and not (f.prosecdef and f.proconfig = array['search_path=""']);
  res := res || jsonb_build_array(jsonb_build_array(p || ': every wallet function is security definer with an empty search_path',
    arr is null, coalesce(arr::text, 'all')));
  select count(*) into n from pg_proc f where f.pronamespace = 'public'::regnamespace and f.proname like 'wallet%';
  res := res || jsonb_build_array(jsonb_build_array(p || ': 37 wallet functions in public', n = 37, n::text));
  res := res || jsonb_build_array(jsonb_build_array(p || ': the office schema and its wallet views and commands are closed to the API roles',
    not has_schema_privilege('anon', 'office', 'usage') and not has_schema_privilege('authenticated', 'office', 'usage')
    and not has_schema_privilege('service_role', 'office', 'usage')
    and not has_table_privilege('authenticated', 'office.cards', 'select') and not has_table_privilege('authenticated', 'office.waiting', 'select')
    and not has_table_privilege('service_role', 'office.cards', 'select') and not has_table_privilege('anon', 'office.waiting', 'select')
    and not has_function_privilege('authenticated', 'office.stamp(text, text, text, date)', 'execute')
    and not has_function_privilege('service_role', 'office.unstamp(text, text)', 'execute')
    and not has_function_privilege('anon', 'office.card(text)', 'execute'), null));

  -- ---------------------------------------------------------------- settings
  select array_agg(c order by c) into arr from unnest(wcols) c
   where not has_column_privilege('authenticated', 'public.business_settings', c, 'select');
  res := res || jsonb_build_array(jsonb_build_array(p || ': staff can read every new settings column (RLS keeps it to managers and the admin)',
    arr is null, coalesce(arr::text, 'all')));
  res := res || jsonb_build_array(jsonb_build_array(p || ': visitors read no settings column; the address column stays closed',
    not has_any_column_privilege('anon', 'public.business_settings', 'select')
    and not has_column_privilege('authenticated', 'public.business_settings', 'shop_address', 'select'), null));
  select jsonb_build_object('apple', s.wallet_apple_on, 'google', s.wallet_google_on, 'slots', s.wallet_slots, 'name', s.wallet_card_name,
           'issuer_address_set', s.wallet_issuer_address is not null, 'issuer_email_set', s.wallet_issuer_email is not null,
           'per_hour', s.wallet_cards_per_hour, 'per_day', s.wallet_cards_per_day, 'stamp_days', s.wallet_stamp_days,
           'reminders', s.wallet_reminders_on, 'first', s.wallet_reminder_first_days, 'again', s.wallet_reminder_again_days,
           'per_gap', s.wallet_reminders_per_gap, 'new', s.wallet_reminder_new_days, 'from', s.wallet_reminder_from_min,
           'until', s.wallet_reminder_until_min, 'after_text_set', s.wallet_reminder_after_text is not null,
           'new_text_set', s.wallet_reminder_new_text is not null, 'quiet_mutes', s.wallet_quiet_mutes_stamps,
           'blank_days', s.wallet_push_blank_days)
    into r from public.business_settings s where s.id = 1;
  res := res || jsonb_build_array(jsonb_build_array(p || ': defaults: both wallets off, 10 slots, "Wash card", no mailbox or email yet, 30 an hour and 200 a day, 60 days to stamp',
    r @> '{"apple": false, "google": false, "slots": 10, "name": "Wash card", "issuer_address_set": false, "issuer_email_set": false,
           "per_hour": 30, "per_day": 200, "stamp_days": 60}'::jsonb, r::text));
  res := res || jsonb_build_array(jsonb_build_array(p || ': reminders are built but off: no wording yet; 28 days, then at most one more 28 days later; 14 days before a first wash; 10 AM to 7 PM',
    r @> '{"reminders": false, "after_text_set": false, "new_text_set": false, "first": 28, "again": 28, "per_gap": 2, "new": 14,
           "from": 600, "until": 1140}'::jsonb, r::text));
  res := res || jsonb_build_array(jsonb_build_array(p || ': stamp notices continue when a holder turns reminders off; push codes blanked after 30 days',
    r @> '{"quiet_mutes": false, "blank_days": 30}'::jsonb, r::text));

  begin
    perform tst.logout();
    execute 'set local role anon';
    r := public.get_public_settings();
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': get_public_settings gives visitors the five wallet keys, and still every earlier key',
      r ?& array['wallet_apple_on', 'wallet_google_on', 'wallet_slots', 'wallet_card_name', 'wallet_reminders_on',
                 'timezone', 'public_phone', 'public_area', 'guest_booking', 'weekly_closures', 'customer_notice']
      and r -> 'wallet_apple_on' = 'false' and r -> 'wallet_slots' = '10', null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': and nothing more (no mailbox, email, caps or reminder wording)',
      not (r ?| array['wallet_issuer_address', 'wallet_issuer_email', 'wallet_cards_per_hour', 'wallet_reminder_after_text', 'shop_address']), null));
  exception when others then
    res := res || jsonb_build_array(jsonb_build_array(p || ': get_public_settings section ran', false, sqlerrm));
  end;

  -- Apple stays off while the mailbox address or the business email is empty (the owner, Nov 11-12).
  -- Only SQLSTATEs are recorded here: a check failure's detail would list the whole settings row.
  begin
    begin update public.business_settings set wallet_apple_on = true where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': Apple can''t be switched on with no mailbox address and no email', v_err = '23514', v_err));
    update public.business_settings set wallet_issuer_address = 'm009 Test Mailbox, Suite 1' where id = 1;
    begin update public.business_settings set wallet_apple_on = true where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': nor with the address but no email', v_err = '23514', v_err));
    update public.business_settings set wallet_issuer_email = 'cards@example.com' where id = 1;
    begin update public.business_settings set wallet_apple_on = true where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': with both, Apple can be switched on', v_err = 'no error', v_err));
    res := res || jsonb_build_array(jsonb_build_array(p || ': and get_public_settings says so', (public.get_public_settings() ->> 'wallet_apple_on')::boolean, null));
    begin update public.business_settings set wallet_issuer_email = null where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': while Apple is on, the email can''t be emptied', v_err = '23514', v_err));
    begin update public.business_settings set wallet_issuer_address = null where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': nor the address', v_err = '23514', v_err));
    begin update public.business_settings set wallet_issuer_email = 'not an email' where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a malformed email is refused', v_err = '23514', v_err));
    update public.business_settings set wallet_apple_on = false where id = 1;
    -- the card's address is never a copy of the owner's home address (a placeholder, set inside this rolled-back block)
    update public.business_settings set shop_address = 'M009 placeholder home, 9 Example Lane' where id = 1;
    begin update public.business_settings set wallet_issuer_address = 'm009 Placeholder Home 9 example lane' where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the card''s address can''t be the owner''s home address, however it is typed', v_err = '23514', v_err));
    update public.business_settings set wallet_issuer_address = null, wallet_issuer_email = null where id = 1;
    -- the website can't get round it either: the admin, through the API
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    begin update public.business_settings set wallet_apple_on = true where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the admin can''t switch Apple on from the website without them either', v_err = '23514', v_err));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    begin update public.business_settings set customer_notice = 'm009 test notice', wallet_issuer_email = 'cards@example.com' where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the admin still saves the settings from the website (the new checks call no function)',
      v_err = 'no error' and (select s.customer_notice = 'm009 test notice' and s.wallet_issuer_email = 'cards@example.com' from public.business_settings s where s.id = 1), v_err));
    begin update public.business_settings set wallet_slots = 0 where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': settings out of range are refused (0 slots)', v_err = '23514', v_err));
    begin update public.business_settings set wallet_reminder_after_text = repeat('x', 121) where id = 1; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a reminder longer than 120 characters is refused', v_err = '23514', v_err));
    raise exception 'm009 rollback';
  exception when others then
    if sqlerrm <> 'm009 rollback' then
      get stacked diagnostics v_state = returned_sqlstate;
      res := res || jsonb_build_array(jsonb_build_array(p || ': Apple settings section ran', false, v_state));
    end if;
  end;

  -- ---------------------------------------------------------------- random text
  select array_agg(public.wallet_random_text(26)) into toks from generate_series(1, 3000);
  res := res || jsonb_build_array(jsonb_build_array(p || ': 3000 tokens of 26 symbols are all different',
    (select count(distinct t) from unnest(toks) t) = 3000, null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': all from the 32 symbols (no I, O, 0 or 1)',
    (select bool_and(t ~ '^[A-HJ-NP-Z2-9]{26}$') from unnest(toks) t), null));
  select count(*), min(q.c), max(q.c) into n, v_err, v
  from (select ch, count(*) as c from unnest(toks) t cross join lateral regexp_split_to_table(t, '') ch group by ch) q;
  res := res || jsonb_build_array(jsonb_build_array(p || ': every symbol is used about equally (78,000 symbols: each 2,000 to 2,900, expected 2,437)',
    n = 32 and v_err::int >= 2000 and v::int <= 2900, n || ' symbols, ' || v_err || ' to ' || v));
  select array_agg(public.wallet_random_text(8)) into toks from generate_series(1, 3000);
  res := res || jsonb_build_array(jsonb_build_array(p || ': 3000 card codes of 8 symbols are all different and well formed',
    (select count(distinct t) from unnest(toks) t) = 3000 and (select bool_and(t ~ '^[A-HJ-NP-Z2-9]{8}$') from unnest(toks) t), null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': Apple''s token has 32 symbols',
    public.wallet_random_text(32) ~ '^[A-HJ-NP-Z2-9]{32}$', null));
  v := tst.q('select public.wallet_random_text(0)');
  v_err := tst.q('select public.wallet_random_text(65)');
  res := res || jsonb_build_array(jsonb_build_array(p || ': lengths outside 1 to 64 are refused', v = 'ERROR P0001: invalid_input' and v_err = 'ERROR P0001: invalid_input', v || ' / ' || v_err));

  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;

-- ==================================================================== 2. the card page
do $$
declare
  p text := 'm009 cards';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  res jsonb := '[]';
  r jsonb;
  r2 jsonb;
  v text;
  v_state text;
  v_msg text;
  v_detail text;
  v_err text;
  v_req uuid;
  v_tok text;
  v_code text;
  v_card uuid;
  v_path text;
  v_path2 text;
  k public.wallet_card_secrets;
  c public.wallet_cards;
  n int;
  i int;
  v_phone text;
  v_other26 text := public.wallet_random_text(26);
begin
  update tst.results set label = 'old ' || label where label like p || ':%';
  select s.public_phone into v_phone from public.business_settings s where s.id = 1;

  begin
    perform tst.logout();
    execute 'set local role anon';
    v := tst.q(format('select public.wallet_new_card(%L::jsonb)', jsonb_build_object('request_id', gen_random_uuid(), 'website', '')));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': while both wallets are off, no card can be made', v = 'ERROR P0001: not_allowed', v));

    update public.business_settings set wallet_google_on = true where id = 1;
    perform tst.logout();
    execute 'set local role anon';
    v_req := gen_random_uuid();
    r := public.wallet_new_card(jsonb_build_object('request_id', v_req, 'website', ''));
    v_tok := r ->> 'token';
    v_code := r ->> 'code';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a visitor makes a card: an 8-symbol code and a 26-symbol token',
      v_code ~ '^[A-HJ-NP-Z2-9]{8}$' and v_tok ~ '^[A-HJ-NP-Z2-9]{26}$' and not r ? 'repeat', null));
    r2 := public.wallet_new_card(jsonb_build_object('request_id', v_req));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the same request again returns the same card',
      r2 ->> 'code' = v_code and r2 ->> 'token' = v_tok and (r2 ->> 'repeat')::boolean, null));
    v := tst.q(format('select public.wallet_new_card(%L::jsonb)', jsonb_build_object('request_id', gen_random_uuid(), 'website', 'http://x')));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the hidden field filled in (a robot) is refused', v = 'ERROR P0001: invalid_input', v));
    v := tst.q('select public.wallet_new_card(''{"website": ""}''::jsonb)');
    v_err := tst.q('select public.wallet_new_card(''[]''::jsonb)');
    res := res || jsonb_build_array(jsonb_build_array(p || ': no request id, or not an object, is refused',
      v = 'ERROR P0001: invalid_input' and v_err = 'ERROR P0001: invalid_input', v || ' / ' || v_err));

    -- download links
    v := tst.q(format('select public.wallet_link(%L::jsonb)', jsonb_build_object('token', v_tok, 'platform', 'apple')));
    res := res || jsonb_build_array(jsonb_build_array(p || ': an Apple link is refused while Apple is off (checked in the database, not only on the page)', v = 'ERROR P0001: not_allowed', v));
    r := public.wallet_link(jsonb_build_object('token', v_tok, 'platform', 'google'));
    v_path := r ->> 'path';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a Google link is a download path with a 26-symbol download token, not the card''s token',
      v_path ~ '^/wallet/google/d/[A-HJ-NP-Z2-9]{26}$' and position(v_tok in v_path) = 0, null));
    r2 := public.wallet_link(jsonb_build_object('token', lower(v_tok), 'platform', 'Google'));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a second tap within a minute gets the same link', r2 ->> 'path' = v_path, null));
    v := tst.q(format('select public.wallet_link(%L::jsonb)', jsonb_build_object('token', v_other26, 'platform', 'google')));
    v_err := tst.q(format('select public.wallet_link(%L::jsonb)', jsonb_build_object('token', 'SHORT', 'platform', 'google')));
    res := res || jsonb_build_array(jsonb_build_array(p || ': an unknown or malformed token finds no card',
      v = 'ERROR P0001: not_found' and v_err = 'ERROR P0001: not_found', v || ' / ' || v_err));
    v := tst.q(format('select public.wallet_link(%L::jsonb)', jsonb_build_object('token', v_tok, 'platform', 'fax')));
    res := res || jsonb_build_array(jsonb_build_array(p || ': only apple or google', v = 'ERROR P0001: invalid_input', v));

    -- the holder's page
    r := public.wallet_card(v_tok);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the holder''s page: 0 of 10, not gold, on no wallet yet, reminders on',
      r @> jsonb_build_object('code', v_code, 'stamps', 0, 'slots', 10, 'member', false, 'voided', false, 'on_apple', false,
                              'on_google', false, 'reminders_off', false, 'card_name', 'Wash card'), r::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': it carries nothing personal and no token (only these keys)',
      (select array_agg(x order by x collate "C") from jsonb_object_keys(r) x) = array['card_name', 'code', 'code_words', 'last_wash_day', 'member',
        'on_apple', 'on_google', 'reminders_off', 'reminders_on', 'slots', 'stamps', 'voided'],
      (select string_agg(x, ',' order by x) from jsonb_object_keys(r) x)));
    v := tst.q(format('select public.wallet_card(%L)', v_other26));
    res := res || jsonb_build_array(jsonb_build_array(p || ': another token finds nothing', v = 'ERROR P0001: not_found', v));
    r := public.wallet_set_reminders(v_tok, false);
    r2 := public.wallet_set_reminders(v_tok, true);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the holder turns reminders off, and on again',
      (r ->> 'reminders_off')::boolean and not (r2 ->> 'reminders_off')::boolean, null));
    v := tst.q(format('select public.wallet_set_reminders(%L, null)', v_tok));
    res := res || jsonb_build_array(jsonb_build_array(p || ': on or off must be given', v = 'ERROR P0001: invalid_input', v));
    execute 'reset role';

    -- as stored
    select * into c from public.wallet_cards x where x.code = v_code;
    select * into k from public.wallet_card_secrets x where x.card_id = c.id;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the card is stored empty, from the page, with its own three tokens',
      c.source = 'page' and c.stamps = 0 and c.last_change = 'new' and c.member_since is null and k.add_token = v_tok
      and k.apple_token ~ '^[A-HJ-NP-Z2-9]{32}$' and k.dl_token ~ '^[A-HJ-NP-Z2-9]{26}$'
      and k.add_token <> k.dl_token and position(k.add_token in k.apple_token) = 0 and k.dl_platform = 'google', null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the download token lives 10 minutes',
      k.dl_expires_at = now() + interval '10 minutes', null));
    update public.wallet_card_secrets x set dl_expires_at = now() + interval '8 minutes' where x.card_id = c.id;
    perform tst.logout();
    execute 'set local role anon';
    r := public.wallet_link(jsonb_build_object('token', v_tok, 'platform', 'google'));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': after a minute a tap gets a new download token',
      r ->> 'path' <> v_path and r ->> 'path' ~ '^/wallet/google/d/[A-HJ-NP-Z2-9]{26}$', null));
    update public.wallet_cards x set voided_at = now(), void_reason = 'm009 test' where x.id = c.id;
    perform tst.logout();
    execute 'set local role anon';
    begin perform public.wallet_link(jsonb_build_object('token', v_tok, 'platform', 'google')); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
      v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    r := public.wallet_card(v_tok);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a voided card gets no link, and its page says so',
      v_err = 'wrong_state' and v_detail like '%' || v_phone || '.' and (r ->> 'voided')::boolean, v_err || ' / ' || coalesce(v_detail, '')));
    raise exception 'm009 rollback';
  exception when others then
    if sqlerrm <> 'm009 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': card page section ran', false, sqlerrm)); end if;
  end;

  -- The caps: 30 an hour from the page (all page cards of the last hour count, made before this run too).
  begin
    update public.business_settings set wallet_google_on = true where id = 1;
    v_req := gen_random_uuid();
    perform tst.logout();
    execute 'set local role anon';
    v_err := 'never refused';
    for i in 1..40 loop
      begin
        perform public.wallet_new_card(jsonb_build_object('request_id', case when i = 1 then v_req else gen_random_uuid() end));
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
        v_err := case when v_state = 'P0001' then v_msg else v_state end;
        exit;
      end;
    end loop;
    execute 'reset role';
    select count(*) into n from public.wallet_cards x where x.source = 'page' and x.created_at > now() - interval '1 hour';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the 31st card in an hour is refused, and the message gives the phone number',
      v_err = 'too_many_requests' and n = 30 and v_detail like '%call ' || v_phone || '.', v_err || ' at ' || n || ' / ' || coalesce(v_detail, '')));
    perform tst.logout();
    execute 'set local role anon';
    r := public.wallet_new_card(jsonb_build_object('request_id', v_req));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a repeat of an earlier request still gets its card', (r ->> 'repeat')::boolean, null));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_list(5);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': Admin''s list says the card limit is reached',
      (r ->> 'cap_reached')::boolean and (r ->> 'cards_this_hour')::int = 30 and (r ->> 'hour_cap')::int = 30
      and jsonb_array_length(r -> 'cards') = 5, r ->> 'cards_this_hour'));
    update public.business_settings set wallet_cards_per_hour = 500, wallet_cards_per_day = n where id = 1;
    perform tst.logout();
    execute 'set local role anon';
    v := tst.q(format('select public.wallet_new_card(%L::jsonb)', jsonb_build_object('request_id', gen_random_uuid())));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the day''s cap refuses too', v = 'ERROR P0001: too_many_requests', v));
    raise exception 'm009 rollback';
  exception when others then
    if sqlerrm <> 'm009 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': caps section ran', false, sqlerrm)); end if;
  end;

  perform tst.logout();
  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;

-- ==================================================================== 3. stamping, the waiting list, the SQL Editor, the audit log
do $$
declare
  p text := 'm009 stamps';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  mgr uuid := '00000000-0000-4000-8000-0000000000b1';
  det uuid := '00000000-0000-4000-8000-0000000000c1';
  cus uuid := '00000000-0000-4000-8000-0000000000d1';
  res jsonb := '[]';
  rec record;
  r jsonb;
  v text;
  v_state text;
  v_msg text;
  v_detail text;
  v_err text;
  v_today date := public.local_today();
  v_a0 bigint;
  ca text; cb text; cw text; cv text;      -- card codes
  wa text; wb text;                        -- card codes as printed ("K7Q2 M9XD")
  ta text;                                 -- card A's add token
  ia uuid; ib uuid; iw uuid; iv uuid;      -- card ids
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b6 uuid; b7 uuid; b9 uuid; b10 uuid; b11 uuid; b12 uuid; b13 uuid;
  r1 text; r2 text; r3 text; r5 text; r10 text; r13 text;
  c public.wallet_cards;
  v_before timestamptz;
  v_sid bigint;
  n int;
  i int;
begin
  update tst.results set label = 'old ' || label where label like p || ':%';

  begin
    select coalesce(max(l.id), 0) into v_a0 from public.audit_log l;
    update public.business_settings set wallet_google_on = true where id = 1;
    r := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())); ca := r ->> 'code'; ta := r ->> 'token';
    cb := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())) ->> 'code';
    cw := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())) ->> 'code';
    cv := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())) ->> 'code';
    select x.id into ia from public.wallet_cards x where x.code = ca;
    select x.id into ib from public.wallet_cards x where x.code = cb;
    select x.id into iw from public.wallet_cards x where x.code = cw;
    select x.id into iv from public.wallet_cards x where x.code = cv;
    wa := public.wallet_code_words(ca);
    wb := public.wallet_code_words(cb);

    -- bookings, entered directly (as the owner) with the status each check needs
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Wren', 'Test', '19725553901', 'shop', v_today - 2, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id, ref into b1, r1;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Wren', 'Test', '19725553901', 'shop', v_today - 1, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id, ref into b2, r2;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Otto', 'Test', '19725553902', 'shop', v_today - 1, 720, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id, ref into b3, r3;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type, anonymized_at)
    values (public.new_booking_ref(), null, null, null, 'shop', v_today - 1, 840, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan', now()) returning id into b4;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Wren', 'Test', '19725553901', 'shop', v_today, 600, 60, 'confirmed', 5000, 'Honda', 'Civic', 'sedan') returning id, ref into b5, r5;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Wren', 'Test', '19725553901', 'shop', v_today + 3, 600, 60, 'confirmed', 5000, 'Honda', 'Civic', 'sedan') returning id into b6;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Wren', 'Test', '19725553901', 'shop', v_today - 61, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b7;
    insert into public.appointments (ref, customer_id, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), cus, 'Carla', 'Test', '19725553903', 'shop', v_today - 5, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b9;
    insert into public.appointments (ref, customer_id, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), cus, 'Carla', 'Test', '19725553904', 'shop', v_today - 4, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id, ref into b10, r10;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Vic', 'Test', '19725553905', 'shop', v_today - 6, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b11;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Vic', 'Test', '19725553905', 'shop', v_today - 3, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b12;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Otto', 'Test', '19725553902', 'shop', v_today, 900, 60, 'confirmed', 5000, 'Honda', 'Civic', 'sedan') returning id, ref into b13, r13;

    -- ---------------------------------------------------------------- who may stamp
    for rec in select * from (values (adm, 'aal1', 'the admin without the authenticator', 'mfa_required'),
                                     (mgr, 'aal2', 'a manager', 'not_allowed'), (det, 'aal1', 'a detailer', 'not_allowed'),
                                     (cus, 'aal1', 'a customer', 'not_allowed')) as t(who, aal, name, want) loop
      perform tst.login(rec.who, rec.aal);
      execute 'set local role authenticated';
      v := tst.q(format('select public.wallet_stamp(%L, %L::uuid)', ca, b1));
      v_err := tst.q(format('select public.wallet_unstamp(1, %L)', 'x'));
      v_msg := tst.q(format('select public.wallet_find(%L)', ca));
      execute 'reset role';
      res := res || jsonb_build_array(jsonb_build_array(p || ': ' || rec.name || ' can''t stamp, take back or open a card',
        v = 'ERROR P0001: ' || rec.want and v_err = 'ERROR P0001: ' || rec.want and v_msg = 'ERROR P0001: ' || rec.want, v || ' / ' || v_err || ' / ' || v_msg));
    end loop;
    perform tst.logout();
    execute 'set local role anon';
    v := tst.q(format('select public.wallet_stamp(%L, %L::uuid)', ca, b1));
    v_err := tst.q(format('select public.wallet_stamp_do(%L::uuid, %L::uuid, null, null, null)', ia, b1));
    v_msg := tst.q(format('select public.wallet_waiting()'));
    -- the holder's own functions, with the card's token, change nothing on the count
    perform public.wallet_card(ta);
    perform public.wallet_link(jsonb_build_object('token', ta, 'platform', 'google'));
    perform public.wallet_set_reminders(ta, true);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a visitor (even holding the card''s token) can''t stamp, call the inner work, or see the waiting list',
      v like 'ERROR 42501:%' and v_err like 'ERROR 42501:%' and v_msg like 'ERROR 42501:%', v || ' / ' || v_err || ' / ' || v_msg));
    perform tst.login(cus, 'aal1');
    execute 'set local role authenticated';
    v := tst.q(format('select public.wallet_stamp_do(%L::uuid, %L::uuid, null, null, %L::uuid)', ia, b1, cus));
    execute 'reset role';
    execute 'set local role service_role';
    v_err := tst.q(format('select public.wallet_stamp(%L, %L::uuid)', ca, b1));
    v_msg := tst.q(format('select public.wallet_stamp_do(%L::uuid, %L::uuid, null, null, null)', ia, b1));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a signed-in customer can''t reach the inner work either, nor can service_role stamp',
      v like 'ERROR 42501:%' and v_err like 'ERROR 42501:%' and v_msg like 'ERROR 42501:%', v || ' / ' || v_err || ' / ' || v_msg));
    res := res || jsonb_build_array(jsonb_build_array(p || ': so self-stamping is impossible: card A still has no stamp',
      (select x.stamps = 0 from public.wallet_cards x where x.id = ia) and not exists (select 1 from public.wallet_stamps st where st.card_id = ia), null));

    -- ---------------------------------------------------------------- the owner stamps
    select x.changed_at into v_before from public.wallet_cards x where x.id = ia;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_stamp(lower(substr(ca, 1, 4)) || ' ' || substr(ca, 5), b1);
    execute 'reset role';
    select * into c from public.wallet_cards x where x.id = ia;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the owner stamps a completed booking: 1 of 10, a stamp notice, changed_at a second or more later',
      r ->> 'count_words' = '1 of 10' and r ->> 'ref' = r1 and c.stamps = 1 and c.last_change = 'stamp'
      and c.last_wash_day = v_today - 2 and c.changed_at >= v_before + interval '1 second' and c.last_notice_at = now(),
      r::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the stamp records who and which booking',
      exists (select 1 from public.wallet_stamps st where st.card_id = ia and st.appointment_id = b1 and st.stamped_by = adm and st.day = v_today - 2), null));

    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    begin perform public.wallet_stamp(cb, b1); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
      v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': one booking fills one slot only, on any card',
      v_err = 'wrong_state' and v_detail = r1 || ' already filled a slot on card ' || wa || '.', v_err || ' / ' || coalesce(v_detail, '')));
    v := tst.q(format('select public.wallet_stamp(%L, %L::uuid)', ca, b1));
    res := res || jsonb_build_array(jsonb_build_array(p || ': and not twice on the same card', v = 'ERROR P0001: wrong_state', v));
    v := tst.q(format('select public.wallet_stamp(%L, %L::uuid)', ca, b5));
    res := res || jsonb_build_array(jsonb_build_array(p || ': today''s confirmed job doesn''t fill a slot before it is completed', v = 'ERROR P0001: wrong_state', v));
    r := public.wallet_stamp(ca, b5, p_complete => true);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': "Complete and stamp" completes today''s job and stamps it in one call',
      (select a.status = 'completed' from public.appointments a where a.id = b5) and (r ->> 'stamps')::int = 2 and r ->> 'ref' = r5, r::text));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    begin perform public.wallet_stamp(ca, b6, p_complete => true); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
      v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a future job is refused by complete_booking''s own check, and stays confirmed',
      v_err = 'wrong_state' and v_detail like 'This job is on %' and (select a.status = 'confirmed' from public.appointments a where a.id = b6)
      and (select x.stamps = 2 from public.wallet_cards x where x.id = ia), v_err || ' / ' || coalesce(v_detail, '')));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    v := tst.q(format('select public.wallet_stamp(%L, %L::uuid)', ca, b7));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a completed booking more than 60 days old is refused', v = 'ERROR P0001: wrong_state', v));
    begin perform public.wallet_stamp(ca); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_hint;
      v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': no booking and no reason is refused (the reason field)', v_err = 'invalid_input' and v_detail = 'reason', v_err || ' / ' || coalesce(v_detail, '')));
    r := public.wallet_stamp(ca, null, 'm009 back-fill one', v_today - 10);
    v := tst.q(format('select public.wallet_stamp(%L, null, %L, %L::date)', ca, 'm009 back-fill again', v_today - 10));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a past wash by hand, with a day and a reason; a second one the same day is refused',
      (r ->> 'stamps')::int = 3 and (r ->> 'day')::date = v_today - 10 and v = 'ERROR P0001: wrong_state', v));
    r := public.wallet_stamp(ca, null, 'm009 back-fill two', v_today - 11);
    v := tst.q(format('select public.wallet_stamp(%L, null, %L, %L::date)', ca, 'm009 future', v_today + 1));
    v_err := tst.q(format('select public.wallet_stamp(%L, null, %L, %L::date)', ca, 'm009 long ago', v_today - 2000));
    res := res || jsonb_build_array(jsonb_build_array(p || ': another past day passes; a future day, or one more than three years back, is refused',
      (r ->> 'stamps')::int = 4 and v = 'ERROR P0001: invalid_input' and v_err = 'ERROR P0001: invalid_input', v || ' / ' || v_err));
    v := tst.q(format('select public.wallet_stamp(%L, null, %L)', ca, 'see https://example.com'));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a reason with a link is refused', v = 'ERROR P0001: invalid_input', v));
    v := tst.q(format('select public.wallet_stamp(%L, %L::uuid, null, %L::date)', cb, b2, v_today - 7));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a booking fills the slot for its own day only', v = 'ERROR P0001: invalid_input', v));
    v := tst.q('select public.wallet_stamp(''ZZZZZZZZ'')');
    res := res || jsonb_build_array(jsonb_build_array(p || ': an unknown card number', v = 'ERROR P0001: not_found', v));
    execute 'reset role';
    select * into c from public.wallet_cards x where x.id = ia;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the last wash stays the latest day after back-filling',
      c.stamps = 4 and c.last_wash_day = v_today, c.last_wash_day::text));

    -- a stamp resets the reminder count (and clears a reminder's text)
    update public.wallet_cards x set reminders_sent = 2, reminder_text = 'm009 old reminder' where x.id = ib;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    perform public.wallet_stamp(cb, b9);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a stamp resets the reminder count and clears the reminder',
      (select x.reminders_sent = 0 and x.reminder_text is null from public.wallet_cards x where x.id = ib), null));

    -- a voided card takes no stamp
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    perform public.wallet_stamp(cv, b11);
    r := public.wallet_void(cv, 'm009 lost card');
    v := tst.q(format('select public.wallet_stamp(%L, %L::uuid)', cv, b12));
    v_err := tst.q(format('select public.wallet_void(%L, %L)', cv, 'again'));
    v_msg := tst.q(format('select public.wallet_void(%L, %L)', cb, ''));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the owner voids a card (with a reason); it takes no more stamps; voiding twice or without a reason is refused',
      (r ->> 'voided')::boolean and v = 'ERROR P0001: wrong_state' and v_err = 'ERROR P0001: wrong_state' and v_msg = 'ERROR P0001: invalid_input'
      and (select x.last_change = 'void' and x.voided_by = adm from public.wallet_cards x where x.id = iv), v || ' / ' || v_err || ' / ' || v_msg));

    -- ---------------------------------------------------------------- the 10th stamp turns the card gold
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    for i in 1..9 loop
      r := public.wallet_stamp(cw, null, 'm009 gold test', v_today - 20 - i);
    end loop;
    execute 'reset role';
    select * into c from public.wallet_cards x where x.id = iw;
    res := res || jsonb_build_array(jsonb_build_array(p || ': 9 of 10 is not gold yet', c.stamps = 9 and c.member_since is null and c.last_change = 'stamp', c.stamps::text));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_stamp(cw, null, 'm009 gold test', v_today - 20);
    execute 'reset role';
    select * into c from public.wallet_cards x where x.id = iw;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the 10th stamp turns the card gold: member, a "Loyalty member" notice',
      c.stamps = 10 and c.member_since is not null and c.last_change = 'member' and (r ->> 'became_member')::boolean
      and r ->> 'count_words' = '10 of 10', r::text));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_stamp(cw, null, 'm009 gold test', v_today - 19);
    execute 'reset role';
    select * into c from public.wallet_cards x where x.id = iw;
    res := res || jsonb_build_array(jsonb_build_array(p || ': after 10 the card stays gold and keeps counting (11 washes, a plain stamp notice)',
      c.stamps = 11 and c.member_since is not null and c.last_change = 'stamp' and r ->> 'count_words' = '11 washes', r::text));

    -- ---------------------------------------------------------------- taking a stamp back
    select st.id into v_sid from public.wallet_stamps st where st.card_id = iw and st.removed_at is null order by st.day desc limit 1;
    select x.changed_at into v_before from public.wallet_cards x where x.id = iw;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_unstamp(v_sid, 'm009 take-back words');
    execute 'reset role';
    select * into c from public.wallet_cards x where x.id = iw;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a take-back lowers the count (10, still gold), recounts the last wash, and notifies nobody',
      c.stamps = 10 and c.member_since is not null and c.last_change = 'unstamp' and c.last_wash_day = v_today - 20
      and c.changed_at >= v_before + interval '1 second', c.last_wash_day::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the stamp is kept, marked taken back, with who and why',
      exists (select 1 from public.wallet_stamps st where st.id = v_sid and st.removed_at is not null and st.removed_by = adm
              and st.resolution = 'm009 take-back words'), null));
    select st.id into i from public.wallet_stamps st where st.card_id = iw and st.removed_at is null order by st.day desc limit 1;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    v := tst.q(format('select public.wallet_unstamp(%s, %L)', v_sid, 'again'));
    v_sid := i;
    v_err := tst.q(format('select public.wallet_unstamp(%s, %L)', v_sid, '  '));
    v_msg := tst.q('select public.wallet_unstamp(-1, ''x'')');
    r := public.wallet_unstamp(v_sid, 'm009 take-back words');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a stamp can''t be taken back twice, or without a reason; an unknown stamp isn''t found',
      v = 'ERROR P0001: wrong_state' and v_err = 'ERROR P0001: invalid_input' and v_msg = 'ERROR P0001: not_found', v || ' / ' || v_err || ' / ' || v_msg));
    select * into c from public.wallet_cards x where x.id = iw;
    res := res || jsonb_build_array(jsonb_build_array(p || ': below 10 the card is no longer gold', c.stamps = 9 and c.member_since is null and not (r ->> 'member')::boolean, c.stamps::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': every card''s count equals its live stamps',
      not exists (select 1 from public.wallet_cards x
                   where x.stamps <> (select count(*) from public.wallet_stamps st where st.card_id = x.id and st.removed_at is null)), null));

    -- ---------------------------------------------------------------- the waiting list and the card screen
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_waiting(14);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': waiting: a completed booking with no stamp is listed, and the card stamped for the same phone is suggested',
      exists (select 1 from jsonb_array_elements(r) e where e ->> 'ref' = r2
               and e -> 'suggestions' -> 0 ->> 'code' = ca and (e -> 'suggestions' -> 0 ->> 'last_day')::date = v_today
               and jsonb_array_length(e -> 'suggestions') = 1), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': another phone gets no suggestion',
      exists (select 1 from jsonb_array_elements(r) e where e ->> 'ref' = r3 and e -> 'suggestions' = '[]'::jsonb), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': an anonymized booking (no phone) gets none',
      exists (select 1 from jsonb_array_elements(r) e where (e ->> 'id')::uuid = b4 and e -> 'suggestions' = '[]'::jsonb), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the same account with another phone is suggested too',
      exists (select 1 from jsonb_array_elements(r) e where e ->> 'ref' = r10 and e -> 'suggestions' -> 0 ->> 'code' = cb), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a voided card is never suggested',
      exists (select 1 from jsonb_array_elements(r) e where (e ->> 'id')::uuid = b12 and e -> 'suggestions' = '[]'::jsonb), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': stamped bookings and confirmed jobs aren''t waiting',
      not exists (select 1 from jsonb_array_elements(r) e where (e ->> 'id')::uuid in (b1, b5, b9, b11, b13, b6)), null));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_waiting(100);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the list never reaches past the 60 stampable days',
      not exists (select 1 from jsonb_array_elements(r) e where (e ->> 'id')::uuid = b7), null));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_find(ca);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the card screen: the card, its stamps (who, booking), and bookings to stamp with the suggested first',
      r -> 'card' @> jsonb_build_object('code', ca, 'stamps', 4, 'member', false)
      and exists (select 1 from jsonb_array_elements(r -> 'stamps') e where e ->> 'ref' = r1 and e ->> 'by' = 'Ada')
      and r -> 'to_stamp' -> 0 ->> 'ref' = r2 and (r -> 'to_stamp' -> 0 ->> 'suggested')::boolean
      and exists (select 1 from jsonb_array_elements(r -> 'to_stamp') e where e ->> 'ref' = r3 and not (e ->> 'suggested')::boolean)
      and exists (select 1 from jsonb_array_elements(r -> 'to_stamp') e where e ->> 'ref' = r13 and e ->> 'action' = 'complete_and_stamp'),
      (r -> 'to_stamp' -> 0)::text));

    -- ---------------------------------------------------------------- the SQL Editor
    v := office.stamp(ca, r2);
    res := res || jsonb_build_array(jsonb_build_array(p || ': office.stamp answers in words',
      v = 'Card ' || wa || ': 5 of 10 (' || r2 || ', ' || to_char(v_today - 1, 'FMMon FMDD') || ').', v));
    res := res || jsonb_build_array(jsonb_build_array(p || ': and records the SQL Editor as the stamper',
      exists (select 1 from public.wallet_stamps st where st.appointment_id = b2 and st.stamped_by is null and st.removed_at is null), null));
    v := office.stamp(ca, r13);
    res := res || jsonb_build_array(jsonb_build_array(p || ': a job not yet completed: complete it on the Admin page first',
      v = 'Complete ' || r13 || ' on the Admin page first, then stamp it.', v));
    v := office.stamp('ZZZZZZZZ', r3);
    v_err := office.stamp(ca, 'AD-ZZZZZZZZ');
    v_msg := office.stamp(ca);
    res := res || jsonb_build_array(jsonb_build_array(p || ': unknown card, unknown booking, no reason: each in words',
      v = 'No card has the number ZZZZZZZZ.' and v_err = 'No booking has the reference AD-ZZZZZZZZ.'
      and v_msg like 'Say why this wash has no booking%', v || ' / ' || v_err || ' / ' || v_msg));
    v := office.stamp(ca, null, 'm009 office back-fill', v_today - 30);
    res := res || jsonb_build_array(jsonb_build_array(p || ': a past wash by hand from the SQL Editor', v like 'Card % 6 of 10 (no booking, %', v));
    v := office.stamp(ca, r2);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the one-slot rule holds there too', v = r2 || ' already filled a slot on card ' || wa || '.', v));
    v := office.unstamp(ca, 'm009 office take-back');
    v_err := office.unstamp(ca, '');
    res := res || jsonb_build_array(jsonb_build_array(p || ': office.unstamp takes back the latest stamp, with a reason',
      v like 'Took back the stamp of % from card ' || wa || ': 5 of 10 now.' and v_err = 'Say why the stamp is taken back.', v || ' / ' || v_err));
    select o."Washes" into v from office.cards o where o."Code" = ca;
    res := res || jsonb_build_array(jsonb_build_array(p || ': office.cards shows "5 of 10"', v = '5 of 10', v));
    select o."Suggested cards" into v from office.waiting o where o."Reference" = r10;
    select o."Suggested cards" into v_err from office.waiting o where o."Reference" = r3;
    res := res || jsonb_build_array(jsonb_build_array(p || ': office.waiting lists the suggestions in words',
      v like wb || ' (1 of 10), last stamped for the same customer on %' and v_err like 'None:%', v || ' / ' || v_err));
    v := office.card(ca);
    res := res || jsonb_build_array(jsonb_build_array(p || ': office.card sums the card up with the holder''s own page link',
      v like 'Card ' || wa || ': 5 of 10. Last wash: %' and right(v, 33) = '/#card-' || ta, left(v, 60)));
    perform tst.logout();
    execute 'set local role anon';
    v := tst.q(format('select office.stamp(%L, %L)', ca, r3));
    v_err := tst.q('select count(*) from office.cards');
    execute 'reset role';
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    v_msg := tst.q(format('select office.card(%L)', ca));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the SQL Editor commands aren''t reachable from the website (visitors or the admin)',
      v like 'ERROR 42501:%' and v_err like 'ERROR 42501:%' and v_msg like 'ERROR 42501:%', v || ' / ' || v_err || ' / ' || v_msg));

    -- ---------------------------------------------------------------- the audit log keeps stamps, never secrets (B1)
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    perform public.wallet_link(jsonb_build_object('token', ta, 'platform', 'google'));
    execute 'reset role';
    select k.apple_token into v from public.wallet_card_secrets k where k.card_id = ia;
    execute 'set local role service_role';
    n := public.wallet_apple_register('m009auditdevice', repeat('ab', 32), ca, v);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': (the flow includes a device registration)', n = 201, n::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': no audit row holds any card''s token, download token, device or push code',
      not exists (select 1 from public.audit_log l cross join public.wallet_card_secrets k
                   where l.id > v_a0 and (coalesce(l.old_value::text, '') || coalesce(l.new_value::text, '')) like any
                         (array['%' || k.add_token || '%', '%' || k.apple_token || '%', '%' || coalesce(k.dl_token, '#none#') || '%']))
      and not exists (select 1 from public.audit_log l where l.id > v_a0
                       and (coalesce(l.old_value::text, '') || coalesce(l.new_value::text, '')) like any (array['%m009auditdevice%', '%' || repeat('ab', 32) || '%'])), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': nor the stamp, take-back or void reasons (free text stays out of the log)',
      not exists (select 1 from public.audit_log l where l.id > v_a0
                   and (coalesce(l.old_value::text, '') || coalesce(l.new_value::text, '')) like any
                       (array['%m009 back-fill%', '%m009 take-back words%', '%m009 office take-back%', '%m009 lost card%', '%m009 gold test%'])), null));
    select count(*) filter (where l.action = 'insert'), count(*) filter (where l.action = 'update') into n, i
    from public.audit_log l where l.id > v_a0 and l.target_type = 'wallet_stamps';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the log has every stamp and every take-back',
      n = (select count(*) from public.wallet_stamps st where st.created_at = now())
      and i = (select count(*) from public.wallet_stamps st where st.removed_at = now()),
      n || ' inserts, ' || i || ' updates'));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a take-back''s row says only that the reason changed, never what it says',
      not exists (select 1 from public.audit_log l where l.id > v_a0 and l.target_type = 'wallet_stamps'
                   and (l.new_value ? 'reason' or l.new_value ? 'resolution' or l.old_value ? 'reason' or l.old_value ? 'resolution'))
      and exists (select 1 from public.audit_log l where l.id > v_a0 and l.target_type = 'wallet_stamps' and l.action = 'update'
                   and l.new_value -> 'private_fields_changed' ? 'resolution'), null));
    select count(*) into n from public.audit_log l where l.id > v_a0 and l.target_type like 'wallet%' and l.target_type <> 'wallet_stamps';
    res := res || jsonb_build_array(jsonb_build_array(p || ': no other wallet table writes to the log', n = 0, n::text));
    raise exception 'm009 rollback';
  exception when others then
    if sqlerrm <> 'm009 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': stamping section ran', false, sqlerrm)); end if;
  end;

  perform tst.logout();
  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;

-- ==================================================================== 4. the Edge Functions' functions
do $$
declare
  p text := 'm009 service';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  res jsonb := '[]';
  r jsonb;
  r2 jsonb;
  v text;
  v_err text;
  v_msg text;
  v_state text;
  v_code text;
  v_tok text;
  v_auth text;
  v_card uuid;
  v_dl text;
  v_n2 text;
  v_n2id uuid;
  v_ms bigint;
  v_at timestamptz;
  v_wrong32 text := public.wallet_random_text(32);
  v_wrong26 text := public.wallet_random_text(26);
  v_today date := public.local_today();
  n int;
  i int;
begin
  update tst.results set label = 'old ' || label where label like p || ':%';

  begin
    update public.business_settings
       set wallet_google_on = true, wallet_issuer_address = 'm009 Test Mailbox, Suite 1', wallet_issuer_email = 'cards@example.com'
     where id = 1;
    update public.business_settings set wallet_apple_on = true where id = 1;
    r := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid()));
    v_code := r ->> 'code';
    v_tok := r ->> 'token';
    select x.id into v_card from public.wallet_cards x where x.code = v_code;
    select k.apple_token into v_auth from public.wallet_card_secrets k where k.card_id = v_card;

    -- ---------------------------------------------------------------- Apple's register and unregister
    execute 'set local role service_role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': register: a malformed device or push code is 400',
      public.wallet_apple_register('bad device!', repeat('ab', 32), v_code, v_auth) = 400
      and public.wallet_apple_register('m009dev01', 'not-hex', v_code, v_auth) = 400, null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': register: a wrong token, or an unknown card, is 401',
      public.wallet_apple_register('m009dev01', repeat('ab', 32), v_code, v_wrong32) = 401
      and public.wallet_apple_register('m009dev01', repeat('ab', 32), 'ZZZZZZZZ', v_auth) = 401
      and public.wallet_apple_register('m009dev01', repeat('ab', 32), v_code, null) = 401, null));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': (and nothing was stored)', not exists (select 1 from public.wallet_apple_devices d where d.device_id = 'm009dev01'), null));
    execute 'set local role service_role';
    n := public.wallet_apple_register('m009dev01', repeat('ab', 32), v_code, v_auth);
    i := public.wallet_apple_register('m009dev01', repeat('cd', 32), v_code, v_auth);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': register: 201 the first time, 200 after (with the new push code kept)',
      n = 201 and i = 200 and (select d.push_token = repeat('cd', 32) from public.wallet_apple_devices d where d.device_id = 'm009dev01'), n || ' / ' || i));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the first registration marks the card added',
      (select x.first_added_at = now() from public.wallet_cards x where x.id = v_card), null));
    execute 'set local role service_role';
    for i in 2..10 loop
      n := public.wallet_apple_register('m009dev' || lpad(i::text, 2, '0'), repeat(to_hex(i), 64), v_code, v_auth);
    end loop;
    n := public.wallet_apple_register('m009dev11', repeat('ef', 32), v_code, v_auth);
    r := public.wallet_apple_targets(v_card);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the 11th device gets 200 and nothing is stored (10 per card at most)',
      n = 200 and not exists (select 1 from public.wallet_apple_devices d where d.device_id = 'm009dev11')
      and (select count(*) from public.wallet_apple_registrations x where x.card_id = v_card and x.removed_at is null) = 10, n::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the push targets are the 10 live push codes', jsonb_array_length(r) = 10, jsonb_array_length(r)::text));
    execute 'set local role service_role';
    n := public.wallet_apple_unregister('m009dev01', v_code, v_wrong32);
    i := public.wallet_apple_unregister('m009dev01', v_code, v_auth);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': unregister: 401 with a wrong token, 200 with the right one, and the registration is marked removed (kept)',
      n = 401 and i = 200 and exists (select 1 from public.wallet_apple_registrations x where x.device_id = 'm009dev01' and x.card_id = v_card
                                         and x.removed_at is not null and x.removed_why = 'unregistered'), n || ' / ' || i));
    execute 'set local role service_role';
    n := public.wallet_apple_register('m009dev01', repeat('ab', 32), v_code, v_auth);
    i := public.wallet_apple_gone(repeat(to_hex(2), 64));
    r := public.wallet_apple_targets(v_card);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a removed device can register again (201); APNs "gone" marks only that device''s registration',
      n = 201 and i = 1 and jsonb_array_length(r) = 9
      and exists (select 1 from public.wallet_apple_registrations x where x.device_id = 'm009dev02' and x.removed_why = 'apns_gone'), n || ' / ' || i));

    -- ---------------------------------------------------------------- "which passes changed?"
    execute 'set local role service_role';
    r := public.wallet_apple_changed('m009dev01', null);
    execute 'reset role';
    select (extract(epoch from x.changed_at) * 1000)::bigint into v_ms from public.wallet_cards x where x.id = v_card;
    res := res || jsonb_build_array(jsonb_build_array(p || ': changed: without a tag, every card on the device, and the tag is changed_at in milliseconds',
      r -> 'serialNumbers' = jsonb_build_array(v_code) and r ->> 'lastUpdated' = v_ms::text, r::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the device''s call is noted',
      (select d.last_seen_at = now() from public.wallet_apple_devices d where d.device_id = 'm009dev01'), null));
    execute 'set local role service_role';
    r := public.wallet_apple_changed('m009dev01', (v_ms + 10000)::text);
    r2 := public.wallet_apple_changed('m009dev01', v_ms::text);
    v := coalesce(public.wallet_apple_changed('m009nodevice', null)::text, 'null') || ' / ' || coalesce(public.wallet_apple_changed('m009dev01', 'abc') ->> 'lastUpdated', 'null');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': nothing newer than the tag (past the 10-second overlap): null, so 204; within the overlap the card comes again',
      r is null and r2 -> 'serialNumbers' = jsonb_build_array(v_code), coalesce(r::text, 'null')));
    res := res || jsonb_build_array(jsonb_build_array(p || ': an unknown device gets null; a malformed tag counts as none', v = 'null / ' || v_ms, v));

    -- the certificate step moves every card forward, so the next ask finds it
    execute 'set local role service_role';
    v := tst.q(format('select public.wallet_cert_installed(%L::date)', v_today - 1));
    n := public.wallet_cert_installed(v_today + 365);
    r := public.wallet_apple_changed('m009dev01', (v_ms + 10000)::text);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a new certificate: its expiry is kept, every card moves forward (re-signed), and the device is told',
      v = 'ERROR P0001: invalid_input' and n >= 1 and r -> 'serialNumbers' = jsonb_build_array(v_code)
      and (select s.wallet_apple_cert_expires = v_today + 365 from public.business_settings s where s.id = 1)
      and (select x.last_change = 'resign' and (extract(epoch from x.changed_at) * 1000)::bigint >= v_ms + 1000 from public.wallet_cards x where x.id = v_card)
      and n = (select count(*) from public.wallet_cards x where x.voided_at is null
                 or exists (select 1 from public.wallet_apple_registrations y where y.card_id = x.id and y.removed_at is null)), n::text));

    -- ---------------------------------------------------------------- the pass data
    perform tst.logout();
    execute 'set local role anon';
    v_dl := substr(public.wallet_link(jsonb_build_object('token', v_tok, 'platform', 'apple')) ->> 'path', 17);
    execute 'reset role';
    execute 'set local role service_role';
    r := public.wallet_pass_data(p_dl => v_dl, p_platform => 'apple');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': pass data by download token: the card, its tokens (for the pass), the count and the issuer',
      r ->> 'code' = v_code and r ->> 'platform' = 'apple' and r ->> 'add_token' = v_tok and r ->> 'apple_token' = v_auth
      and (r ->> 'stamps')::int = 0 and (r ->> 'slots')::int = 10 and not (r ->> 'voided')::boolean and r ->> 'card_name' = 'Wash card'
      and r -> 'issuer' = jsonb_build_object('area', 'Parker, Texas', 'phone', '(945) 361-7551', 'address', 'm009 Test Mailbox, Suite 1', 'email', 'cards@example.com'),
      r ->> 'code_words'));
    res := res || jsonb_build_array(jsonb_build_array(p || ': it holds nothing personal (no names, phones of customers, bookings or the owner''s address)',
      (select array_agg(x order by x collate "C") from jsonb_object_keys(r) x) = array['add_token', 'apple_token', 'card_id', 'card_name', 'changed_at',
        'changed_at_ms', 'code', 'code_words', 'count_words', 'google_object_id', 'google_saved', 'issuer', 'last_change', 'last_wash_day',
        'member', 'member_since', 'notify', 'platform', 'reminder_text', 'site_url', 'slots', 'stamps', 'voided'],
      (select string_agg(x, ',' order by x) from jsonb_object_keys(r) x)));
    execute 'set local role service_role';
    v := coalesce(public.wallet_pass_data(p_dl => v_dl, p_platform => 'google')::text, 'null')
      || ' / ' || coalesce(public.wallet_pass_data(p_dl => v_wrong26)::text, 'null')
      || ' / ' || coalesce(public.wallet_pass_data(p_dl => 'short')::text, 'null')
      || ' / ' || coalesce(public.wallet_pass_data()::text, 'null');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the wrong platform''s route, an unknown or malformed download token, or nothing: null', v = 'null / null / null / null', v));
    update public.wallet_card_secrets k set dl_expires_at = now() - interval '1 second' where k.card_id = v_card;
    execute 'set local role service_role';
    r := public.wallet_pass_data(p_dl => v_dl);
    r2 := public.wallet_pass_data(p_code => v_code, p_auth => v_auth);
    v := coalesce(public.wallet_pass_data(p_code => v_code, p_auth => v_wrong32)::text, 'null')
      || ' / ' || coalesce(public.wallet_pass_data(p_code => v_code, p_auth => v_auth, p_platform => 'google')::text, 'null');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': an expired download token gets null; Apple''s own request (code and token) gets the pass',
      r is null and r2 ->> 'code' = v_code and r2 ->> 'platform' = 'apple', coalesce(r::text, 'null')));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a wrong Apple token, or a Google route with Apple''s token, gets null', v = 'null / null', v));
    -- notices: a stamp notifies, unless the holder silenced everything (the setting is off by default)
    perform public.wallet_stamp_do(v_card, null, 'm009 service stamp', null, null);
    execute 'set local role service_role';
    r := public.wallet_pass_data(p_code => v_code, p_auth => v_auth);
    execute 'reset role';
    update public.wallet_cards x set reminders_off = true where x.id = v_card;
    execute 'set local role service_role';
    r2 := public.wallet_pass_data(p_code => v_code, p_auth => v_auth);
    execute 'reset role';
    update public.business_settings set wallet_quiet_mutes_stamps = true where id = 1;
    execute 'set local role service_role';
    v := public.wallet_pass_data(p_code => v_code, p_auth => v_auth) ->> 'notify';
    execute 'reset role';
    update public.business_settings set wallet_quiet_mutes_stamps = false where id = 1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a stamp shows a notice, even with reminders off; only the "silence everything" setting mutes it',
      (r ->> 'notify')::boolean and r ->> 'last_change' = 'stamp' and (r2 ->> 'notify')::boolean and v = 'false', v));
    -- Apple off: no pass at all; a voided card: no new download, but Apple's request gets the voided pass
    update public.business_settings set wallet_apple_on = false where id = 1;
    execute 'set local role service_role';
    r := public.wallet_pass_data(p_code => v_code, p_auth => v_auth);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': with Apple off, no Apple pass is served', r is null, coalesce(r::text, 'null')));
    update public.business_settings set wallet_apple_on = true where id = 1;
    update public.wallet_cards x set voided_at = now(), void_reason = 'm009 test' where x.id = v_card;
    update public.wallet_card_secrets k set dl_expires_at = now() + interval '5 minutes' where k.card_id = v_card;
    execute 'set local role service_role';
    r := public.wallet_pass_data(p_dl => v_dl);
    r2 := public.wallet_pass_data(p_code => v_code, p_auth => v_auth);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a voided card gets no new download, but a phone that has it gets the voided pass',
      r is null and (r2 ->> 'voided')::boolean, coalesce(r::text, 'null')));

    -- ---------------------------------------------------------------- sync bookkeeping and Google
    v_n2 := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())) ->> 'code';
    select x.id, x.changed_at into v_n2id, v_at from public.wallet_cards x where x.code = v_n2;
    execute 'set local role service_role';
    r := public.wallet_pending(500);
    v := tst.q(format('select public.wallet_synced(%L::uuid, %L, %L::timestamptz)', v_n2id, 'apple', v_at + interval '1 second'));
    v_err := tst.q(format('select public.wallet_synced(%L::uuid, %L, %L::timestamptz)', v_n2id, 'fax', v_at));
    v_msg := public.wallet_synced(v_n2id, 'apple', v_at)::text || ' ' || public.wallet_synced(v_n2id, 'google', v_at)::text;
    r2 := public.wallet_pending(500);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a new card is pending for both wallets; synced (with nothing to send) it no longer is',
      exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = v_n2 and (e ->> 'apple')::boolean and (e ->> 'google')::boolean)
      and v_msg = 'true true' and not exists (select 1 from jsonb_array_elements(r2) e where e ->> 'code' = v_n2), v_msg));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a time newer than the card, or another platform, is refused',
      v = 'ERROR P0001: invalid_input' and v_err = 'ERROR P0001: invalid_input', v || ' / ' || v_err));
    execute 'set local role service_role';
    v := tst.q(format('select public.wallet_google_issued(%L, %L)', v_n2, 'not an id'));
    perform public.wallet_google_issued(v_n2, '3388000000012345678.' || v_n2);
    r := public.wallet_pending(500);
    perform public.wallet_google_saved(v_n2, true);
    r2 := public.wallet_pending(500);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': Google: a save link is recorded and watched for a week until it is saved; the save marks the card added',
      v = 'ERROR P0001: invalid_input'
      and exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = v_n2 and (e ->> 'google_check')::boolean)
      and not exists (select 1 from jsonb_array_elements(r2) e where e ->> 'code' = v_n2)
      and (select x.google_saved and x.first_added_at = now() and x.google_object_id = '3388000000012345678.' || v_n2
             from public.wallet_cards x where x.id = v_n2id), v));
    execute 'set local role service_role';
    n := public.wallet_problem('apple', 'BadDeviceToken', 'm009 test problem');
    execute 'reset role';
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    r := public.wallet_list(10);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a sync problem shows in Admin''s list, with the Apple settings'' state',
      exists (select 1 from jsonb_array_elements(r -> 'problems') e where (e ->> 'id')::int = n and e ->> 'code' = 'BadDeviceToken')
      and (r ->> 'apple_ready')::boolean and (r ->> 'apple_on')::boolean and (r ->> 'apple_cert_expires')::date = v_today + 365, null));

    -- ---------------------------------------------------------------- push codes blanked after 30 days with no card
    update public.wallet_apple_registrations x set removed_at = now() - interval '31 days', removed_why = 'unregistered'
     where x.device_id = 'm009dev03';
    update public.wallet_apple_registrations x set removed_at = now() - interval '5 days', removed_why = 'unregistered'
     where x.device_id = 'm009dev04';
    execute 'set local role service_role';
    n := public.wallet_blank_old_push_tokens();
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a device with no card for 31 days loses its push code (the row stays); 5 days, or a live card, keeps it',
      n >= 1 and (select d.push_token is null from public.wallet_apple_devices d where d.device_id = 'm009dev03')
      and (select d.push_token is not null from public.wallet_apple_devices d where d.device_id = 'm009dev04')
      and (select d.push_token is not null from public.wallet_apple_devices d where d.device_id = 'm009dev05'), n::text));

    -- ---------------------------------------------------------------- Vault: only by name, never shown
    execute 'set local role service_role';
    v := coalesce(public.wallet_vault_get('m009_not_a_wallet_name'), 'null') || ' / ' || coalesce(public.wallet_vault_get('wallet_sync_url'), 'null');
    v_err := tst.q('select public.wallet_vault_put(''wallet_sync_secret'', ''x'')');
    v_msg := tst.q('select public.wallet_vault_put(''m009_other'', ''x'')');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': wallet_vault_get answers only its four names (others get null); wallet_vault_put writes only the Apple key and certificate',
      v = 'null / null' and v_err = 'ERROR P0001: invalid_input' and v_msg = 'ERROR P0001: invalid_input', v || ' / ' || v_err || ' / ' || v_msg));

    -- ---------------------------------------------------------------- roles
    perform tst.logout();
    execute 'set local role anon';
    v := tst.q(format('select public.wallet_pass_data(%L)', v_dl));
    v_err := tst.q('select public.wallet_vault_get(''wallet_apple_key'')');
    v_msg := tst.q('select public.wallet_apple_changed(''m009dev01'', null)');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': visitors can''t call the Edge Functions'' functions',
      v like 'ERROR 42501:%' and v_err like 'ERROR 42501:%' and v_msg like 'ERROR 42501:%', v || ' / ' || v_err || ' / ' || v_msg));
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    v := tst.q('select public.wallet_due_reminders()');
    v_err := tst.q('select public.wallet_cert_installed(current_date + 400)');
    execute 'reset role';
    execute 'set local role service_role';
    v_msg := tst.q(format('select public.wallet_find(%L)', v_code));
    v_state := tst.q('select count(*) from public.wallet_cards');
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': nor can the admin through the website; service_role can''t open the owner''s screens or read the tables',
      v like 'ERROR 42501:%' and v_err like 'ERROR 42501:%' and v_msg like 'ERROR 42501:%' and v_state like 'ERROR 42501:%',
      v || ' / ' || v_err || ' / ' || v_msg || ' / ' || v_state));
    raise exception 'm009 rollback';
  exception when others then
    if sqlerrm <> 'm009 rollback' then
      get stacked diagnostics v_state = returned_sqlstate;
      res := res || jsonb_build_array(jsonb_build_array(p || ': service section ran', false, v_state || ' ' || sqlerrm));
    end if;
  end;

  perform tst.logout();
  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;

-- ==================================================================== 5. reminders (built, off until the owner approves the wording)
do $$
declare
  p text := 'm009 reminders';
  res jsonb := '[]';
  r jsonb;
  v text;
  v_err text;
  v_today date := public.local_today();
  v_tz text;
  t11 timestamptz;
  t03 timestamptz;
  t1930 timestamptz;
  c1 text;
  c2 text;
  c3 text;
  i1 uuid;
  i2 uuid;
  i3 uuid;
  b1 uuid;
  b2 uuid;
  c public.wallet_cards;
  v_before timestamptz;
begin
  update tst.results set label = 'old ' || label where label like p || ':%';
  select s.timezone into v_tz from public.business_settings s where s.id = 1;
  t11 := (v_today + time '11:00') at time zone v_tz;
  t03 := (v_today + time '03:00') at time zone v_tz;
  t1930 := (v_today + time '19:30') at time zone v_tz;

  begin
    update public.business_settings set wallet_google_on = true where id = 1;
    -- card 1: washed 30 days ago, saved in Google Wallet
    c1 := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())) ->> 'code';
    select x.id into i1 from public.wallet_cards x where x.code = c1;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Remy', 'Test', '19725553911', 'shop', v_today - 30, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b1;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Remy', 'Test', '19725553911', 'shop', v_today - 1, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b2;
    perform public.wallet_stamp_do(i1, b1, null, null, null);
    update public.wallet_cards x set google_saved = true, google_object_id = '3388000000012345678.' || c1, first_added_at = now() - interval '40 days'
     where x.id = i1;
    -- card 2: added 15 days ago, no wash yet
    c2 := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())) ->> 'code';
    select x.id into i2 from public.wallet_cards x where x.code = c2;
    update public.wallet_cards x set google_saved = true, first_added_at = ((v_today - 15) + time '12:00') at time zone v_tz where x.id = i2;
    -- card 3: made 20 days ago but never added to a wallet
    c3 := public.wallet_new_card(jsonb_build_object('request_id', gen_random_uuid())) ->> 'code';
    select x.id into i3 from public.wallet_cards x where x.code = c3;
    update public.wallet_cards x set created_at = now() - interval '20 days' where x.id = i3;

    r := public.wallet_due_reminders(t11);
    res := res || jsonb_build_array(jsonb_build_array(p || ': nothing is due while reminders are off (the default)', r = '[]'::jsonb, r::text));
    update public.business_settings
       set wallet_reminders_on = true, wallet_reminder_after_text = 'm009 after-wash words', wallet_reminder_new_text = 'm009 first-wash words'
     where id = 1;
    r := public.wallet_due_reminders(t11);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the stamp''s own notice today holds the reminder back (one notice a day)',
      not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c1), r::text));
    update public.wallet_cards x set last_notice_at = now() - interval '2 days' where x.id = i1;
    r := public.wallet_due_reminders(t11);
    res := res || jsonb_build_array(jsonb_build_array(p || ': 28 days after the last wash, at 11 AM, the after-wash reminder is due, with the approved words',
      exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c1 and e ->> 'kind' = 'after_wash'
              and e ->> 'text' = 'm009 after-wash words' and (e ->> 'google')::boolean), r::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': 14 days after a card was added with no wash, the one first-wash reminder is due',
      exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c2 and e ->> 'kind' = 'before_first' and e ->> 'text' = 'm009 first-wash words'), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a card on no wallet gets nothing', not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c3), null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': daytime only: nothing at 3 AM or 7:30 PM in Parker',
      public.wallet_due_reminders(t03) = '[]'::jsonb and public.wallet_due_reminders(t1930) = '[]'::jsonb, null));
    update public.wallet_cards x set last_wash_day = v_today - 27 where x.id = i1;
    r := public.wallet_due_reminders(t11);
    update public.wallet_cards x set last_wash_day = v_today - 30 where x.id = i1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': not before 28 days', not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c1), null));
    update public.wallet_cards x set reminders_off = true where x.id in (i1, i2);
    r := public.wallet_due_reminders(t11);
    update public.wallet_cards x set reminders_off = false where x.id in (i1, i2);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the holder''s Stop switch is respected',
      not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' in (c1, c2)), r::text));
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Remy', 'Test', '19725553911', 'shop', v_today + 5, 600, 60, 'confirmed', 5000, 'Honda', 'Civic', 'sedan');
    r := public.wallet_due_reminders(t11);
    update public.appointments a set status = 'cancelled' where a.contact_phone = '19725553911' and a.status = 'confirmed';
    res := res || jsonb_build_array(jsonb_build_array(p || ': no reminder while the same customer has a booking coming up',
      not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c1), null));
    update public.wallet_cards x set voided_at = now(), void_reason = 'm009 test' where x.id = i2;
    r := public.wallet_due_reminders(t11);
    update public.wallet_cards x set voided_at = null, void_reason = null where x.id = i2;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a voided card gets nothing', not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c2), null));
    update public.business_settings set wallet_reminder_after_text = null, wallet_reminder_new_days = null where id = 1;
    r := public.wallet_due_reminders(t11);
    update public.business_settings set wallet_reminder_after_text = 'm009 after-wash words', wallet_reminder_new_days = 14 where id = 1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': with no approved wording (or no first-wash days), that kind is never sent',
      not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' in (c1, c2)), r::text));

    -- sending
    execute 'set local role service_role';
    v := tst.q(format('select public.wallet_reminded(%L::uuid, %L, %L)', i1, 'after_wash', 'Free wash inside!'));
    v_err := tst.q(format('select public.wallet_reminded(%L::uuid, %L)', i1, 'before_first'));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': only the approved words, and only the kind that is due',
      v = 'ERROR P0001: invalid_input' and v_err = 'ERROR P0001: wrong_state', v || ' / ' || v_err));
    select x.changed_at into v_before from public.wallet_cards x where x.id = i1;
    execute 'set local role service_role';
    r := public.wallet_reminded(i1, 'after_wash', 'm009 after-wash words', 0, true);
    v := tst.q(format('select public.wallet_reminded(%L::uuid, %L)', i1, 'after_wash'));
    execute 'reset role';
    select * into c from public.wallet_cards x where x.id = i1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a reminder puts its words on the card, moves changed_at (so the pass updates) and is recorded',
      c.reminder_text = 'm009 after-wash words' and c.last_change = 'reminder' and c.reminders_sent = 1 and c.changed_at >= v_before + interval '1 second'
      and exists (select 1 from public.wallet_reminders w where w.card_id = i1 and w.kind = 'after_wash' and w.google and w.body = 'm009 after-wash words'),
      r::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the same reminder can''t go twice', v = 'ERROR P0001: wrong_state', v));
    update public.wallet_cards x set last_notice_at = ((v_today - 27) + time '12:00') at time zone v_tz,
                                     last_reminder_at = ((v_today - 27) + time '12:00') at time zone v_tz where x.id = i1;
    r := public.wallet_due_reminders(t11);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the second waits 28 days after the first', not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c1), null));
    update public.wallet_cards x set last_notice_at = ((v_today - 28) + time '12:00') at time zone v_tz,
                                     last_reminder_at = ((v_today - 28) + time '12:00') at time zone v_tz where x.id = i1;
    r := public.wallet_due_reminders(t11);
    res := res || jsonb_build_array(jsonb_build_array(p || ': then it is due', exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c1 and e ->> 'kind' = 'after_wash'), null));
    execute 'set local role service_role';
    perform public.wallet_reminded(i1, 'after_wash');
    execute 'reset role';
    update public.wallet_cards x set last_notice_at = now() - interval '90 days', last_reminder_at = now() - interval '90 days' where x.id = i1;
    r := public.wallet_due_reminders(t11);
    res := res || jsonb_build_array(jsonb_build_array(p || ': after two, quiet until the next wash',
      not exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = c1)
      and (select x.reminders_sent = 2 from public.wallet_cards x where x.id = i1), r::text));
    perform public.wallet_stamp_do(i1, b2, null, null, null);
    select * into c from public.wallet_cards x where x.id = i1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the next wash starts the count again and clears the reminder from the card',
      c.reminders_sent = 0 and c.reminder_text is null and c.last_change = 'stamp' and c.last_wash_day = v_today - 1, null));

    execute 'set local role service_role';
    r := public.wallet_reminded(i2, 'before_first');
    execute 'reset role';
    update public.wallet_cards x set last_notice_at = now() - interval '200 days', first_added_at = now() - interval '300 days' where x.id = i2;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the first-wash reminder goes once and never again',
      r ->> 'text' = 'm009 first-wash words' and (select x.new_reminder_at is not null from public.wallet_cards x where x.id = i2)
      and not exists (select 1 from jsonb_array_elements(public.wallet_due_reminders(t11)) e where e ->> 'code' = c2), null));
    update public.wallet_cards x set first_added_at = ((v_today - 10) + time '12:00') at time zone v_tz, new_reminder_at = null where x.id = i2;
    res := res || jsonb_build_array(jsonb_build_array(p || ': and not before 14 days after the card was added',
      not exists (select 1 from jsonb_array_elements(public.wallet_due_reminders(t11)) e where e ->> 'code' = c2), null));
    raise exception 'm009 rollback';
  exception when others then
    if sqlerrm <> 'm009 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': reminders section ran', false, sqlerrm)); end if;
  end;

  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;
select label, passed, detail from tst.results where label like 'm009 %' order by id;
