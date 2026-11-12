-- Migration 009, part 5c (Nov 12, 2026; review round 2): notices are capped (20261112220001 the rule in wallet_stamp_do
-- and wallet_cards.notify_change, 20261112220002 wallet_pass_data, 20261112220003 wallet_sync_card). Needs the m001
-- framework and fixtures (test project only) and Migration 009 parts 1-5c applied. One DO block, one MCP query, inside a
-- block that is rolled back at its end: the cards, bookings and stamps it makes are never kept, the settings it changes
-- go back, and the update calls its stamps queue are never sent. No token is ever shown.
-- The rule (file 1): a stamp or the gold change shows a notice only when it isn't a past day added by hand (except the
-- stamp that turns the card gold), no notice went out on that card today on Parker's clock (reminders included), and
-- the holder didn't silence everything. Plan 4.4, 6.2 and 9 ("the 4th notice in 24 hours is refused").
-- 16 checks (Nov 12, 2026): all pass on a local PostgreSQL 16 copy built from the migration files and on the test
-- project (part 5c at versions 20261112210532, 20261112210547, 20261112210556). Against the functions before part 5c
-- (with only the new column added) 11 of the 16 fail, the reviewer's probe among them (4 notices from 4 past washes).
-- After part 5c the other suites ran again on the test project: m009_tests_wallet.sql blocks 1, 3, 4 and 5 (40, 57, 32
-- and 24; block 2 calls none of the changed functions) and m009_tests_sync.sql (8 and 12), all passing.
-- Read the results with:
--   select label, passed, detail from tst.results where label like 'm009 notices%' order by id;

do $$
declare
  p text := 'm009 notices';
  res jsonb := '[]';
  r jsonb;
  d jsonb;
  v text;
  v_err text;
  v_today date := public.local_today();
  v_tz text;
  v_now timestamptz := now();
  v_codes text[] := '{}';
  -- card A: back-fill, then today's washes; B: a reminder, then a stamp; C: a silent stamp, then the reminder list;
  -- D: gold by hand; E: gold on a day with a notice; F: silenced
  ia uuid; ib uuid; ic uuid; idd uuid; ie uuid; i_f uuid;
  dla text;
  b1 uuid; b2 uuid; b3 uuid; bb uuid; bb2 uuid; bc uuid; be uuid; bf uuid;
  c public.wallet_cards;
  i int;
  n_notice int;
  n_sync int;
  n_pass int;
  agree boolean := true;
  v_list jsonb := '[]';
begin
  update tst.results set label = 'old ' || label where label like p || ':%';
  select s.timezone into v_tz from public.business_settings s where s.id = 1;

  begin
    update public.business_settings set wallet_google_on = true where id = 1;
    -- six cards of their own, made directly; card A also gets a Google download token so wallet_pass_data can be read
    for i in 1..6 loop
      v_codes := v_codes || public.wallet_random_text(8);
    end loop;
    insert into public.wallet_cards (code) values (v_codes[1]) returning id into ia;
    insert into public.wallet_cards (code) values (v_codes[2]) returning id into ib;
    insert into public.wallet_cards (code) values (v_codes[3]) returning id into ic;
    insert into public.wallet_cards (code) values (v_codes[4]) returning id into idd;
    insert into public.wallet_cards (code) values (v_codes[5]) returning id into ie;
    insert into public.wallet_cards (code) values (v_codes[6]) returning id into i_f;
    dla := public.wallet_random_text(26);
    insert into public.wallet_card_secrets (card_id, add_token, apple_token, dl_token, dl_platform, dl_expires_at)
    select x.id, case when x.id = ia then dla else public.wallet_random_text(26) end, public.wallet_random_text(32),
           case when x.id = ia then dla end, case when x.id = ia then 'google' end,
           case when x.id = ia then now() + interval '5 minutes' end
      from public.wallet_cards x where x.id in (ia, ib, ic, idd, ie, i_f);
    update public.wallet_cards x set google_saved = true, google_object_id = '3388000000012345678.' || x.code,
           first_added_at = now() - interval '200 days'
     where x.id in (ia, ib, ic, idd, ie, i_f);
    -- completed bookings (test phones of their own, so no other booking holds a reminder back)
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Remy', 'Test', '19725553921', 'shop', v_today, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b1;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Remy', 'Test', '19725553921', 'shop', v_today, 720, 60, 'completed', 5000, 'Mazda', 'CX-5', 'suv') returning id into b2;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Remy', 'Test', '19725553921', 'shop', v_today - 1, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into b3;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Sage', 'Test', '19725553922', 'shop', v_today - 30, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into bb;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Sage', 'Test', '19725553922', 'shop', v_today, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into bb2;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Kai', 'Test', '19725553923', 'shop', v_today - 30, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into bc;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Noa', 'Test', '19725553924', 'shop', v_today, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into be;
    insert into public.appointments (ref, contact_first, contact_last, contact_phone, location_type, service_date, start_min, duration_min, status, value_cents, vehicle_make, vehicle_model, vehicle_type)
    values (public.new_booking_ref(), 'Ari', 'Test', '19725553925', 'shop', v_today, 600, 60, 'completed', 5000, 'Honda', 'Civic', 'sedan') returning id into bf;

    -- ---------------------------------------------------------------- the reviewer's probe: four past washes by hand
    n_notice := 0; n_sync := 0; n_pass := 0;
    for i in 1..4 loop
      r := public.wallet_stamp_do(ia, null, 'm009 notices: a wash before the card', v_today - 100 - i, null);
      execute 'set local role service_role';
      d := public.wallet_sync_card(ia);
      v := public.wallet_pass_data(p_dl => dla, p_platform => 'google') ->> 'notify';
      execute 'reset role';
      n_notice := n_notice + case when (r ->> 'notice')::boolean then 1 else 0 end;
      n_sync := n_sync + case when (d ->> 'notify')::boolean then 1 else 0 end;
      n_pass := n_pass + case when v::boolean then 1 else 0 end;
      agree := agree and (d ->> 'notify') = v;
    end loop;
    select * into c from public.wallet_cards x where x.id = ia;
    res := res || jsonb_build_array(jsonb_build_array(p || ': four past washes added by hand in one sitting notify nobody (the sync, the pass and Google''s notifyPreference all say no)',
      n_notice = 0 and n_sync = 0 and n_pass = 0 and c.stamps = 4 and c.last_change = 'stamp' and not c.notify_change
      and c.last_notice_at is null,
      jsonb_build_object('notice', n_notice, 'sync', n_sync, 'pass', n_pass, 'stamps', c.stamps)::text));

    -- ---------------------------------------------------------------- today: one notice, then quiet
    r := public.wallet_stamp_do(ia, b1, null, null, null);
    execute 'set local role service_role';
    d := public.wallet_sync_card(ia);
    v := public.wallet_pass_data(p_dl => dla, p_platform => 'google') ->> 'notify';
    execute 'reset role';
    agree := agree and (d ->> 'notify') = v;
    select * into c from public.wallet_cards x where x.id = ia;
    res := res || jsonb_build_array(jsonb_build_array(p || ': today''s wash notifies on both wallets, and the card records the notice',
      (r ->> 'notice')::boolean and (d ->> 'notify')::boolean and v = 'true' and c.notify_change and c.last_notice_at = v_now
      and (d ->> 'stamps')::int = 5, r::text));
    r := public.wallet_stamp_do(ia, b2, null, null, null);
    execute 'set local role service_role';
    d := public.wallet_sync_card(ia);
    v := public.wallet_pass_data(p_dl => dla, p_platform => 'google') ->> 'notify';
    execute 'reset role';
    agree := agree and (d ->> 'notify') = v;
    select * into c from public.wallet_cards x where x.id = ia;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a second car the same day fills its slot quietly (one notice a day per card)',
      not (r ->> 'notice')::boolean and not (d ->> 'notify')::boolean and v = 'false' and not c.notify_change
      and c.last_notice_at = v_now and c.stamps = 6 and (d ->> 'apple_pending')::boolean and (d ->> 'google_pending')::boolean,
      r::text));
    r := public.wallet_stamp_do(ia, null, 'm009 notices: a wash with no booking, today', null, null);
    execute 'set local role service_role';
    d := public.wallet_sync_card(ia);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a wash by hand for today after that is quiet too',
      not (r ->> 'notice')::boolean and not (d ->> 'notify')::boolean and (r ->> 'stamps')::int = 7, r::text));
    -- the 4th change today: a reminder (wording set for the test, reminders on)
    update public.business_settings
       set wallet_reminders_on = true, wallet_reminder_after_text = 'm009 after-wash words', wallet_reminder_new_text = 'm009 first-wash words'
     where id = 1;
    update public.wallet_cards x set last_wash_day = v_today - 40 where x.id = ia;   -- as if due, to show the day's notice holds it
    begin
      perform public.wallet_reminded(ia, 'after_wash', 'm009 after-wash words', 0, true);
      v_err := 'sent';
    exception when others then v_err := sqlerrm;
    end;
    -- the same card with yesterday's notice instead: the reminder would be due, so only the day's notice held it back
    update public.wallet_cards x set last_notice_at = ((v_today - 1) + time '23:50') at time zone v_tz where x.id = ia;
    select coalesce(jsonb_agg(x.kind), '[]'::jsonb) into v_list from public.wallet_due_list(v_now, ia, false) x;
    update public.wallet_cards x set last_wash_day = v_today, last_notice_at = v_now where x.id = ia;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the 4th notice in 24 hours is refused: after three washes today, a reminder isn''t due either (one notice a day keeps every card under Google''s 3)',
      v_err = 'wrong_state' and v_list = '["after_wash"]'::jsonb, v_err || ' / ' || v_list::text));

    -- ---------------------------------------------------------------- the next day
    update public.wallet_cards x set last_notice_at = ((v_today - 1) + time '23:50') at time zone v_tz where x.id = ia;
    r := public.wallet_stamp_do(ia, b3, null, null, null);
    select * into c from public.wallet_cards x where x.id = ia;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a notice yesterday (even at 11:50 PM) doesn''t hold back today''s; a booking''s wash notifies whatever its day',
      (r ->> 'notice')::boolean and (r ->> 'day')::date = v_today - 1 and c.notify_change and c.last_notice_at = v_now, r::text));

    -- ---------------------------------------------------------------- a take-back is silent
    perform public.wallet_unstamp_do((r ->> 'stamp_id')::bigint, 'm009 notices: the wrong card', null);
    execute 'set local role service_role';
    d := public.wallet_sync_card(ia);
    v := public.wallet_pass_data(p_dl => dla, p_platform => 'google') ->> 'notify';
    execute 'reset role';
    agree := agree and (d ->> 'notify') = v;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a take-back notifies nobody',
      d ->> 'last_change' = 'unstamp' and not (d ->> 'notify')::boolean and v = 'false', d ->> 'last_change'));

    -- ---------------------------------------------------------------- a reminder, then a stamp the same day
    perform public.wallet_stamp_do(ib, bb, null, null, null);
    update public.wallet_cards x set last_notice_at = now() - interval '29 days' where x.id = ib;
    r := public.wallet_reminded(ib, 'after_wash', 'm009 after-wash words', 0, true);
    execute 'set local role service_role';
    d := public.wallet_sync_card(ib);
    execute 'reset role';
    v := (d ->> 'notify') || ' ' || (d ->> 'last_change');
    r := public.wallet_stamp_do(ib, bb2, null, null, null);
    execute 'set local role service_role';
    d := public.wallet_sync_card(ib);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a reminder notifies; a wash later the same day fills its slot quietly (a stamp notice and a reminder never on the same day)',
      v = 'true reminder' and not (r ->> 'notice')::boolean and not (d ->> 'notify')::boolean and d ->> 'last_change' = 'stamp'
      and d ->> 'reminder_text' is null, v || ' / ' || r::text));

    -- ---------------------------------------------------------------- a quiet stamp holds no reminder back
    perform public.wallet_stamp_do(ic, bc, null, null, null);
    update public.wallet_cards x set last_notice_at = now() - interval '29 days' where x.id = ic;
    r := public.wallet_stamp_do(ic, null, 'm009 notices: an older wash, recorded late', v_today - 45, null);
    select * into c from public.wallet_cards x where x.id = ic;
    select coalesce(jsonb_agg(x.kind), '[]'::jsonb) into v_list from public.wallet_due_list(v_now, ic, false) x;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a quiet stamp leaves the last notice where it was, so the reminder that is due still goes',
      not (r ->> 'notice')::boolean and c.last_notice_at < v_now - interval '28 days' and c.last_wash_day = v_today - 30
      and v_list = '["after_wash"]'::jsonb, v_list::text));

    -- ---------------------------------------------------------------- gold
    v_err := null;
    for i in 1..9 loop
      r := public.wallet_stamp_do(idd, null, 'm009 notices: gold by hand', v_today - 60 - i, null);
      if (r ->> 'notice')::boolean then v_err := 'a back-fill notified'; end if;
    end loop;
    v := coalesce(v_err, 'quiet');
    r := public.wallet_stamp_do(idd, null, 'm009 notices: gold by hand', v_today - 60, null);
    execute 'set local role service_role';
    d := public.wallet_sync_card(idd);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': past washes by hand stay quiet until the one that turns the card gold: one "Loyalty member" notice',
      v = 'quiet' and (r ->> 'became_member')::boolean and (r ->> 'notice')::boolean and d ->> 'last_change' = 'member'
      and (d ->> 'notify')::boolean and (d ->> 'member')::boolean, v || ' / ' || r::text));
    r := public.wallet_stamp_do(idd, null, 'm009 notices: gold by hand', v_today - 59, null);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the 11th (a past day by hand) is quiet; the card stays gold',
      not (r ->> 'notice')::boolean and (r ->> 'member')::boolean and (r ->> 'stamps')::int = 11, r::text));
    for i in 1..8 loop
      perform public.wallet_stamp_do(ie, null, 'm009 notices: gold on a busy day', v_today - 60 - i, null);
    end loop;
    r := public.wallet_stamp_do(ie, be, null, null, null);
    v := r ->> 'notice';
    r := public.wallet_stamp_do(ie, null, 'm009 notices: a second car, no booking', null, null);
    execute 'set local role service_role';
    d := public.wallet_sync_card(ie);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': gold on a day that already had a notice turns the card gold quietly',
      v = 'true' and (r ->> 'became_member')::boolean and not (r ->> 'notice')::boolean and d ->> 'last_change' = 'member'
      and not (d ->> 'notify')::boolean, v || ' / ' || r::text));

    -- ---------------------------------------------------------------- silenced
    update public.business_settings set wallet_quiet_mutes_stamps = true where id = 1;
    update public.wallet_cards x set reminders_off = true where x.id = i_f;
    r := public.wallet_stamp_do(i_f, bf, null, null, null);
    select * into c from public.wallet_cards x where x.id = i_f;
    update public.business_settings set wallet_quiet_mutes_stamps = false where id = 1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a holder who silenced everything gets no notice, and no notice is recorded',
      not (r ->> 'notice')::boolean and not c.notify_change and c.last_notice_at is null, r::text));

    res := res || jsonb_build_array(jsonb_build_array(p || ': the pass (wallet_pass_data) and the sync (wallet_sync_card) agree on every change above',
      agree, null));
    res := res || jsonb_build_array(jsonb_build_array(p || ': the new column is closed to the API roles like the rest of the card',
      not has_column_privilege('anon', 'public.wallet_cards', 'notify_change', 'select')
      and not has_column_privilege('authenticated', 'public.wallet_cards', 'notify_change', 'select')
      and not has_column_privilege('service_role', 'public.wallet_cards', 'notify_change', 'select'), null));
    raise exception 'm009 rollback';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'm009 rollback' then
      res := res || jsonb_build_array(jsonb_build_array(p || ': the block ran to its end', false, left(v_err, 200)));
    end if;
  end;
  res := res || jsonb_build_array(jsonb_build_array(p || ': nothing was kept (the test cards are gone with the rollback; reminders off, no wording)',
    not exists (select 1 from public.wallet_cards x where x.code = any (v_codes))
    and (select not s.wallet_reminders_on and s.wallet_reminder_after_text is null and not s.wallet_quiet_mutes_stamps
           from public.business_settings s where s.id = 1), null));

  for r in select value from jsonb_array_elements(res) loop
    perform tst.ok((r ->> 1)::boolean, r ->> 0, r ->> 2);
  end loop;
end $$;
select label, passed, detail from tst.results where label like 'm009 notices%' order by id;
