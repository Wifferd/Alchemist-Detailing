-- Migration 009, part 5 (Nov 12, 2026): the update call and the schedules (20261112120005 extensions, 20261112120006
-- the call). Needs the m001 framework and fixtures (test project only), parts 1-5 applied, and for the "calls" block
-- pg_net and the two Vault entries (wallet_sync_url, wallet_sync_secret). Two DO blocks, each one MCP query. The second
-- runs inside a block that is rolled back at its end, so the card and stamps it makes are never kept and the calls it
-- queues are never sent (pg_net's worker only sees committed rows: that is one of the checks). No Vault value and no
-- header value is ever read out: checks look at Vault names and at whether a header is present.
-- Read the results with:
--   select label, passed, detail from tst.results where label like 'm009 sync%' order by id;

-- ==================================================================== 1. setup: rights, the trigger, the schedules
do $$
declare
  p text := 'm009 sync setup';
  res jsonb := '[]';
  r jsonb;
  arr text[];
  n int;
  v text;
  internal text[] := array['public.wallet_call(text,jsonb)', 'public.wallet_card_changed()', 'public.wallet_sweep_due()',
                           'public.wallet_sweep_tick()', 'public.wallet_reminders_tick()',
                           'office.wallet_setup(text,text)', 'office.wallet_setup_result(bigint)'];
begin
  update tst.results set label = 'old ' || label where label like p || ':%';

  res := res || jsonb_build_array(jsonb_build_array(p || ': wallet_sync_card runs for service_role only',
    has_function_privilege('service_role', 'public.wallet_sync_card(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.wallet_sync_card(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.wallet_sync_card(uuid)', 'execute'), null));
  select array_agg(f) into arr from unnest(internal) f
   where has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
      or has_function_privilege('service_role', f, 'execute');
  res := res || jsonb_build_array(jsonb_build_array(p || ': the call, the trigger function, the ticks and the office setup are closed to every API role',
    arr is null, coalesce(arr::text, 'none')));
  select array_agg(x.oid::regprocedure::text) into arr
  from pg_proc x join pg_namespace ns on ns.oid = x.pronamespace
  where (ns.nspname, x.proname) in (('public', 'wallet_sync_card'), ('public', 'wallet_call'), ('public', 'wallet_card_changed'),
          ('public', 'wallet_sweep_due'), ('public', 'wallet_sweep_tick'), ('public', 'wallet_reminders_tick'),
          ('office', 'wallet_setup'), ('office', 'wallet_setup_result'))
    and not (x.prosecdef and coalesce(x.proconfig, '{}') @> array['search_path=""']);
  res := res || jsonb_build_array(jsonb_build_array(p || ': all eight are security definer with an empty search_path',
    arr is null, coalesce(arr::text, 'none')));
  select count(*) into n from pg_trigger tg
   where tg.tgrelid = 'public.wallet_cards'::regclass and tg.tgname = 'wallet_cards_sync' and not tg.tgisinternal
     and tg.tgtype = 17                                              -- after, update, per row
     and tg.tgfoid = 'public.wallet_card_changed()'::regprocedure
     and tg.tgqual is not null                                       -- when changed_at moved
     and tg.tgattr::text = (select a.attnum::text from pg_attribute a
                             where a.attrelid = 'public.wallet_cards'::regclass and a.attname = 'changed_at');
  res := res || jsonb_build_array(jsonb_build_array(p || ': wallet_cards_sync fires after an update of changed_at, per row, only when it moved',
    n = 1, n::text));
  select array_agg(c.relname || '.' || tg.tgname order by c.relname || '.' || tg.tgname) into arr
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
  where c.relnamespace = 'public'::regnamespace and c.relname like 'wallet\_%' and not tg.tgisinternal;
  res := res || jsonb_build_array(jsonb_build_array(p || ': the wallet tables have only the stamps audit and the sync trigger',
    arr = array['wallet_cards.wallet_cards_sync', 'wallet_stamps.wallet_stamps_audit'], coalesce(arr::text, 'none')));
  res := res || jsonb_build_array(jsonb_build_array(p || ': pg_net and pg_cron are on, Supabase Vault is present',
    (select count(*) from pg_extension where extname in ('pg_net', 'pg_cron', 'supabase_vault')) = 3,
    (select string_agg(extname || ' ' || extversion, ', ' order by extname) from pg_extension
      where extname in ('pg_net', 'pg_cron', 'supabase_vault'))));
  select string_agg(s.name, ', ' order by s.name) into v from vault.secrets s where s.name in ('wallet_sync_url', 'wallet_sync_secret');
  res := res || jsonb_build_array(jsonb_build_array(p || ': the two Vault entries exist (names only; no value is read)',
    v = 'wallet_sync_secret, wallet_sync_url', coalesce(v, 'none')));
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select string_agg(j.jobname || ' ' || j.schedule || ' ' || j.command, ' | ' order by j.jobname)
                 from cron.job j where j.jobname like 'wallet-%'$q$ into v;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the three schedules: sweep every 10 minutes, reminders daily at 16:07 UTC, tidy on Sundays',
      v = 'wallet-reminders 7 16 * * * select public.wallet_reminders_tick() | wallet-sync-sweep */10 * * * * select public.wallet_sweep_tick() | wallet-tidy 17 9 * * 0 select public.wallet_blank_old_push_tokens()',
      v));
  else
    res := res || jsonb_build_array(jsonb_build_array(p || ': the three schedules (pg_cron is off here)', false, 'no pg_cron'));
  end if;

  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;

-- ==================================================================== 2. the call after a change (rolled back)
do $$
declare
  p text := 'm009 sync calls';
  res jsonb := '[]';
  r jsonb;
  v text;
  v_err text;
  v_card uuid;
  v_code text;
  n int;
  n2 int;
  q record;
  d jsonb;
  v_id bigint;
begin
  update tst.results set label = 'old ' || label where label like p || ':%';
  begin
    -- a card of its own, made directly (the page's flags stay as they are)
    v_code := public.wallet_random_text(8);
    insert into public.wallet_cards (code) values (v_code) returning id into v_card;
    insert into public.wallet_card_secrets (card_id, add_token, apple_token)
    values (v_card, public.wallet_random_text(26), public.wallet_random_text(32));
    select count(*) into n from net.http_request_queue x where convert_from(x.body, 'utf8') like '%' || v_card || '%';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a new card queues no call (nothing to update yet; the sweep marks it)',
      n = 0, n::text));

    v := office.stamp(v_code, null, 'Sync test wash', null);
    select count(*) as n, min(x.url) as url, bool_and(x.headers ? 'x-wallet-secret') as has_secret,
           bool_and(x.headers ->> 'content-type' = 'application/json') as is_json
      into q
      from net.http_request_queue x where convert_from(x.body, 'utf8') like '%' || v_card || '%';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a stamp queues exactly one call to .../functions/v1/wallet-sync/sync, JSON, with the secret header',
      q.n = 1 and q.url ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/wallet-sync/sync$' and q.has_secret and q.is_json,
      q.n || ' ' || coalesce(q.url, '-')));
    select x.timeout_milliseconds, x.method into q from net.http_request_queue x
     where convert_from(x.body, 'utf8') like '%' || v_card || '%';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the call is a POST with a 30-second timeout',
      q.timeout_milliseconds = 30000 and q.method = 'POST', q.method || ' ' || q.timeout_milliseconds));

    execute 'set local role service_role';
    d := public.wallet_sync_card(v_card);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': wallet_sync_card shows the stamp, both wallets pending, a notice, and no token',
      (d ->> 'stamps')::int = 1 and d ->> 'last_change' = 'stamp' and (d ->> 'notify')::boolean
      and (d ->> 'apple_pending')::boolean and (d ->> 'google_pending')::boolean
      and not (d ? 'add_token') and not (d ? 'apple_token') and not (d::text ~ '[A-HJ-NP-Z2-9]{26}'),
      d ->> 'count_words'));

    -- a stamp that rolls back queues nothing: its call disappears with it
    begin
      v := office.stamp(v_code, null, 'Sync test wash, rolled back', public.local_today() - 1);
      select count(*) into n from net.http_request_queue x where convert_from(x.body, 'utf8') like '%' || v_card || '%';
      raise exception 'inner rollback';
    exception when others then
      null;
    end;
    select count(*) into n2 from net.http_request_queue x where convert_from(x.body, 'utf8') like '%' || v_card || '%';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a second stamp queued a second call, and rolling it back took the call away',
      n = 2 and n2 = 1 and (select c.stamps from public.wallet_cards c where c.id = v_card) = 1, n || ' then ' || n2));

    -- bookkeeping that doesn't move changed_at queues nothing
    execute 'set local role service_role';
    perform public.wallet_synced(v_card, 'apple', (d ->> 'changed_at')::timestamptz);
    perform public.wallet_synced(v_card, 'google', (d ->> 'changed_at')::timestamptz);
    d := public.wallet_sync_card(v_card);
    execute 'reset role';
    select count(*) into n from net.http_request_queue x where convert_from(x.body, 'utf8') like '%' || v_card || '%';
    res := res || jsonb_build_array(jsonb_build_array(p || ': marking a card synced queues no call, and it stops being pending',
      n = 1 and not (d ->> 'apple_pending')::boolean and not (d ->> 'google_pending')::boolean, n::text));

    -- a take-back moves changed_at: one more call
    v := office.unstamp(v_code, 'Sync test take-back');
    select count(*) into n from net.http_request_queue x where convert_from(x.body, 'utf8') like '%' || v_card || '%';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a take-back queues one more call', n = 2, n::text));

    -- the ticks
    v_id := public.wallet_sweep_tick();
    res := res || jsonb_build_array(jsonb_build_array(p || ': the sweep tick calls wallet-sync/sweep while a card lags',
      public.wallet_sweep_due() and v_id is not null
      and (select x.url from net.http_request_queue x where x.id = v_id) like '%/wallet-sync/sweep', coalesce(v_id::text, 'null')));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the reminders tick calls nothing while reminders are off',
      (select not s.wallet_reminders_on from public.business_settings s where s.id = 1) and public.wallet_reminders_tick() is null, null));

    -- the SQL Editor setup refuses unknown steps and a certificate that isn't one
    begin
      perform office.wallet_setup('make-coffee');
      v_err := 'accepted';
    exception when others then v_err := 'refused';
    end;
    begin
      perform office.wallet_setup('apple-cert', 'not a certificate');
      v := 'accepted';
    exception when others then v := 'refused';
    end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': office.wallet_setup refuses an unknown step and a non-certificate',
      v_err = 'refused' and v = 'refused', v_err || ' / ' || v));
    begin
      perform public.wallet_call('Bad Step!');
      v := 'accepted';
    exception when sqlstate 'P0001' then v := 'refused';
    end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': wallet_call refuses a malformed step name', v = 'refused', v));

    raise exception 'm009 rollback';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'm009 rollback' then
      res := res || jsonb_build_array(jsonb_build_array(p || ': the block ran to its end', false, left(v_err, 200)));
    end if;
  end;
  select count(*) into n from public.wallet_cards c where c.code = v_code;
  res := res || jsonb_build_array(jsonb_build_array(p || ': nothing was kept (the test card is gone with the rollback)', n = 0, n::text));

  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;
