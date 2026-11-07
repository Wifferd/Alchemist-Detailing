-- Migration 008 (Nov 7, 2026; the owner's answers 1, 3 and 5 to doc 45):
--   part 1 (20261107120001): start_booking only on the job's own day, complete_booking on that day or later
--          (Parker's date, public.local_today()); a confirmed job that was never started can still be completed;
--   part 2 (20261107120002): no API role reads business_settings.shop_address (column privileges), and
--          shop_address_on_file() tells the admin, and only the admin, whether an address is on file;
--   part 3 (20261107120003): my_bookings gives a manager's own "Come to us" booking no address (the way round
--          part 2), and returns each booking's conditions.
-- Needs the m001 framework and fixtures (test project only) and the migrations applied. One DO block, so it runs as
-- a single query through the Supabase MCP (top-level "set role" hangs there). Every check that writes runs inside
-- a block that is rolled back at its end, so nothing it makes is kept and it can run again; the answers are kept in
-- a variable and recorded at the end. The address itself is never read: only "is it set" and privileges.
-- Read the results with:
--   select label, passed, detail from tst.results where label like 'm008:%' order by id;
do $$
declare
  p text := 'm008';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  mgr uuid := '00000000-0000-4000-8000-0000000000b1';
  det uuid := '00000000-0000-4000-8000-0000000000c1';
  cus uuid := '00000000-0000-4000-8000-0000000000d1';
  res jsonb := '[]';
  rec record;
  v_today date; v_day date; i int; n int;
  v_id uuid; v_id2 uuid; a public.appointments;
  v_state text; v_msg text; v_detail text; v_err text; v_want text;
  v_on boolean; v_b boolean;
  cols text[];
  r jsonb;
begin
  update tst.results set label = 'old ' || label where label like 'm008:%';
  v_today := public.local_today();   -- read as the owner: the signed-in roles can't call local_today

  -- a free driveway start a month ahead (staff_create_booking enters a confirmed booking there)
  for i in 0..14 loop
    v_day := v_today + 30 + i;
    exit when 600 = any (public.get_availability(v_day, 120, 'shop')) and 660 = any (public.get_availability(v_day, 120, 'shop'));
  end loop;

  -- ------------------------------------------------------------ part 1: start and complete on the job's day
  begin
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    a := public.staff_create_booking(tst.booking('shop', v_day, 600, '{"contact_first":"Sweep","contact_last":"Eight","contact_phone":"(972) 555-3801","special_request":"m008 test","bundle":null,"exterior":"ext_basic","conditions":[]}'));
    v_id := a.id;
    res := res || jsonb_build_array(jsonb_build_array(p || ': fixture: a confirmed job a month ahead', a.status = 'confirmed' and a.service_date = v_day, a.status || ' ' || a.service_date));

    begin perform public.start_booking(v_id); v_err := 'no error'; v_detail := null;
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    v_want := 'This job is on ' || to_char(v_day, 'Dy, Mon FMDD')
              || case when extract(year from v_day) <> extract(year from v_today) then to_char(v_day, ', YYYY') else '' end
              || '. Start it on that day.';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a future job can''t be started, and the message names its day',
      v_err = 'wrong_state' and v_detail = v_want, v_err || ' / ' || coalesce(v_detail, '')));

    begin perform public.complete_booking(v_id); v_err := 'no error'; v_detail := null;
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    v_want := 'This job is on ' || to_char(v_day, 'Dy, Mon FMDD')
              || case when extract(year from v_day) <> extract(year from v_today) then to_char(v_day, ', YYYY') else '' end
              || '. It can be completed on that day or later.';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a future job can''t be completed, and the message names its day',
      v_err = 'wrong_state' and v_detail = v_want, v_err || ' / ' || coalesce(v_detail, '')));
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': (the refused job is still confirmed)', (select status = 'confirmed' from public.appointments where id = v_id), null));

    update public.appointments set service_date = v_today - 3 where id = v_id;   -- as the owner: a past confirmed job
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    begin perform public.start_booking(v_id); v_err := 'no error'; v_detail := null;
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    v_want := 'This job was on ' || to_char(v_today - 3, 'Dy, Mon FMDD')
              || case when extract(year from v_today - 3) <> extract(year from v_today) then to_char(v_today - 3, ', YYYY') else '' end
              || '. A job is started only on its own day: complete it, or change its time.';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a past job can''t be started, and the message names its day',
      v_err = 'wrong_state' and v_detail = v_want, v_err || ' / ' || coalesce(v_detail, '')));
    execute 'reset role';

    update public.appointments set service_date = v_today where id = v_id;
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    a := public.start_booking(v_id);
    res := res || jsonb_build_array(jsonb_build_array(p || ': a job on today''s date can be started', a.status = 'in_progress', a.status::text));
    a := public.complete_booking(v_id, 'm008 test');
    res := res || jsonb_build_array(jsonb_build_array(p || ': and completed today', a.status = 'completed', a.status::text));
    begin perform public.start_booking(v_id); v_err := 'no error'; v_detail := null;
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the status check still comes first',
      v_err = 'wrong_state' and v_detail = 'Only confirmed bookings can be started.', v_err || ' / ' || coalesce(v_detail, '')));
    execute 'reset role';

    -- a job started on its day and left open: completed the next day
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    a := public.staff_create_booking(tst.booking('shop', v_day, 660, '{"contact_first":"Sweep","contact_last":"Eight","contact_phone":"(972) 555-3802","special_request":"m008 test","bundle":null,"exterior":"ext_basic","conditions":[]}'));
    v_id2 := a.id;
    execute 'reset role';
    update public.appointments set service_date = v_today where id = v_id2;
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    perform public.start_booking(v_id2);
    execute 'reset role';
    update public.appointments set service_date = v_today - 1 where id = v_id2;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    a := public.complete_booking(v_id2);
    res := res || jsonb_build_array(jsonb_build_array(p || ': a job started on an earlier day can be completed later', a.status = 'completed', a.status::text));
    execute 'reset role';
    raise exception 'm008 rollback';
  exception when others then
    if sqlerrm <> 'm008 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': start and complete section ran', false, sqlerrm)); end if;
  end;

  -- a confirmed job that was never started: completed today, or after its day
  begin
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    v_id := (public.staff_create_booking(tst.booking('shop', v_day, 600, '{"contact_first":"Sweep","contact_last":"Eight","contact_phone":"(972) 555-3803","special_request":"m008 test","bundle":null,"exterior":"ext_basic","conditions":[]}'))).id;
    v_id2 := (public.staff_create_booking(tst.booking('shop', v_day, 660, '{"contact_first":"Sweep","contact_last":"Eight","contact_phone":"(972) 555-3804","special_request":"m008 test","bundle":null,"exterior":"ext_basic","conditions":[]}'))).id;
    execute 'reset role';
    update public.appointments set service_date = v_today where id = v_id;
    update public.appointments set service_date = v_today - 2 where id = v_id2;
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    a := public.complete_booking(v_id);
    res := res || jsonb_build_array(jsonb_build_array(p || ': a confirmed job never started can be completed today', a.status = 'completed', a.status::text));
    a := public.complete_booking(v_id2);
    res := res || jsonb_build_array(jsonb_build_array(p || ': and one from an earlier day too', a.status = 'completed', a.status::text));
    execute 'reset role';
    raise exception 'm008 rollback';
  exception when others then
    if sqlerrm <> 'm008 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': never-started section ran', false, sqlerrm)); end if;
  end;

  -- the functions keep their settings and grants
  res := res || jsonb_build_array(jsonb_build_array(p || ': start_booking and complete_booking stay security definer with an empty search_path',
    (select bool_and(prosecdef and proconfig = array['search_path=""']) from pg_proc
      where oid in ('public.start_booking(uuid)'::regprocedure, 'public.complete_booking(uuid, text)'::regprocedure)), null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': signed-in users may call them, visitors may not',
    has_function_privilege('authenticated', 'public.start_booking(uuid)', 'execute') and has_function_privilege('authenticated', 'public.complete_booking(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.start_booking(uuid)', 'execute') and not has_function_privilege('anon', 'public.complete_booking(uuid, text)', 'execute'), null));

  -- ------------------------------------------------------------ part 2: the address column
  res := res || jsonb_build_array(jsonb_build_array(p || ': signed-in users have no table-wide read of the settings', not has_table_privilege('authenticated', 'public.business_settings', 'select'), null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': signed-in users can''t read the address column', not has_column_privilege('authenticated', 'public.business_settings', 'shop_address', 'select'), null));
  select array_agg(c.column_name::text order by c.ordinal_position) into cols from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'business_settings' and c.column_name <> 'shop_address'
     and not has_column_privilege('authenticated', 'public.business_settings', c.column_name, 'select');
  res := res || jsonb_build_array(jsonb_build_array(p || ': every other column stays readable', cols is null, coalesce(cols::text, 'all')));
  res := res || jsonb_build_array(jsonb_build_array(p || ': visitors read no column', not has_any_column_privilege('anon', 'public.business_settings', 'select'), null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': the admin''s update right is unchanged', has_table_privilege('authenticated', 'public.business_settings', 'update'), null));

  v_on := exists (select 1 from public.business_settings s where s.id = 1 and nullif(btrim(s.shop_address), '') is not null);
  begin
    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    select count(*) into n from (select first_start_min, last_start_min, slot_step_min, latest_end_min, min_days_ahead, max_days_ahead, hold_hours,
      max_shop_jobs, max_mobile_jobs, shop_buffer_min, mobile_buffer_min, public_phone, public_area, mobile_radius_miles, require_mfa_for_managers
      from public.business_settings where id = 1) x;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a manager still reads the Settings screen''s columns', n = 1, n::text));
    begin perform count(*) from public.business_settings where shop_address is not null; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a manager can''t filter on the address', v_err = '42501', v_err));
    begin perform (select to_jsonb(s) from public.business_settings s where id = 1); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a manager can''t read the whole row', v_err = '42501', v_err));
    begin perform public.shop_address_on_file(); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a manager can''t ask whether an address is on file', v_err = 'not_allowed', v_err));
    execute 'reset role';

    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    v_b := public.shop_address_on_file();
    res := res || jsonb_build_array(jsonb_build_array(p || ': the admin learns whether an address is on file', v_b = v_on, v_b::text || ' / ' || v_on::text));
    begin perform count(*) from public.business_settings where shop_address is not null; v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate; v_err := v_state; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': through the API the admin can''t read the address either', v_err = '42501', v_err));
    update public.business_settings set customer_notice = 'm008 test notice' where id = 1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the admin still saves the customer notice', (select customer_notice = 'm008 test notice' from public.business_settings where id = 1), null));
    execute 'reset role';

    update public.business_settings set shop_address = null where id = 1;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    res := res || jsonb_build_array(jsonb_build_array(p || ': no address on file reads false', public.shop_address_on_file() = false, null));
    execute 'reset role';
    update public.business_settings set shop_address = 'm008 test address' where id = 1;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    res := res || jsonb_build_array(jsonb_build_array(p || ': an address on file reads true', public.shop_address_on_file() = true, null));
    execute 'reset role';
    raise exception 'm008 rollback';
  exception when others then
    if sqlerrm <> 'm008 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': address section ran', false, sqlerrm)); end if;
  end;

  for rec in select * from (values (adm, 'aal1', 'the admin without the authenticator', 'mfa_required'), (det, 'aal1', 'a detailer', 'not_allowed'),
                                   (cus, 'aal1', 'a customer', 'not_allowed'), (null, null, 'a visitor', '42501')) as t(who, aal, name, want) loop
    begin
      if rec.who is null then perform tst.logout(); execute 'set local role anon';
      else perform tst.login(rec.who, rec.aal); execute 'set local role authenticated'; end if;
      begin perform public.shop_address_on_file(); v_err := 'no error';
      exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
      res := res || jsonb_build_array(jsonb_build_array(p || ': shop_address_on_file refuses ' || rec.name, v_err = rec.want, v_err));
      execute 'reset role';
      raise exception 'm008 rollback';
    exception when others then
      if sqlerrm <> 'm008 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': role section ran (' || rec.name || ')', false, sqlerrm)); end if;
    end;
  end loop;
  res := res || jsonb_build_array(jsonb_build_array(p || ': shop_address_on_file is closed to visitors and open to signed-in users',
    not has_function_privilege('anon', 'public.shop_address_on_file()', 'execute') and has_function_privilege('authenticated', 'public.shop_address_on_file()', 'execute')
    and (select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.shop_address_on_file()'::regprocedure), null));

  -- ------------------------------------------------------------ part 3: my_bookings
  -- Each role books a "Come to us" job with "Other" for itself, a manager confirms it, and the booker reads it back.
  -- A placeholder address is set inside each rolled-back block; only "is it there" is checked.
  for rec in select * from (values (cus, 'aal1', 'a customer', true), (det, 'aal1', 'a detailer', true), (adm, 'aal2', 'the admin', true),
                                   (mgr, 'aal2', 'a manager', false), (mgr, 'aal1', 'a manager without the authenticator', false)) as t(who, aal, name, want) loop
    begin
      update public.business_settings set shop_address = 'm008 placeholder address' where id = 1;
      perform tst.login(rec.who, rec.aal);
      execute 'set local role authenticated';
      v_id := (public.submit_booking(tst.booking('shop', v_day, 600, '{"conditions":["pet_hair","other"],"special_request":"m008 test"}')) ->> 'id')::uuid;
      select x into r from public.my_bookings() x where x ->> 'id' = v_id::text;
      if rec.name = 'a customer' then
        res := res || jsonb_build_array(jsonb_build_array(p || ': my_bookings returns the booking''s conditions',
          r -> 'conditions' @> '["pet_hair", "other"]'::jsonb and jsonb_array_length(r -> 'conditions') = 2, coalesce(r ->> 'conditions', 'none')));
        res := res || jsonb_build_array(jsonb_build_array(p || ': a request carries no address', r ? 'shop_address' and r ->> 'shop_address' is null, r ->> 'status'));
      end if;
      execute 'reset role';
      perform tst.login(mgr, 'aal2');
      execute 'set local role authenticated';
      perform public.confirm_booking(v_id);
      execute 'reset role';
      perform tst.login(rec.who, rec.aal);
      execute 'set local role authenticated';
      select x into r from public.my_bookings() x where x ->> 'id' = v_id::text;
      res := res || jsonb_build_array(jsonb_build_array(p || ': my_bookings: ' || rec.name || '''s own confirmed "Come to us" booking '
        || case when rec.want then 'still carries the address' else 'carries no address' end,
        r ->> 'status' = 'confirmed' and (r ->> 'shop_address' is not null) = rec.want, coalesce(r ->> 'status', 'no row')));
      execute 'reset role';
      raise exception 'm008 rollback';
    exception when others then
      if sqlerrm <> 'm008 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': my_bookings section ran (' || rec.name || ')', false, sqlerrm)); end if;
    end;
  end loop;
  res := res || jsonb_build_array(jsonb_build_array(p || ': my_bookings stays security definer with an empty search_path, for signed-in users only',
    (select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.my_bookings()'::regprocedure)
    and has_function_privilege('authenticated', 'public.my_bookings()', 'execute') and not has_function_privilege('anon', 'public.my_bookings()', 'execute'), null));

  perform tst.logout();
  for rec in select value as e from jsonb_array_elements(res) loop
    perform tst.ok((rec.e ->> 1)::boolean, rec.e ->> 0, rec.e ->> 2);
  end loop;
end $$;
select label, passed, detail from tst.results where label like 'm008:%' order by id;
