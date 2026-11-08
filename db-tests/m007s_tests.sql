-- Migration 007s: a detailer reads their jobs through my_jobs(), and the booking tables are for managers only (doc 28).
-- Needs the m001 framework and fixtures (test project only), and the migration applied. One DO block, so it runs
-- as a single query through the Supabase MCP (top-level "set role" hangs there); each role is taken with
-- execute 'set local role ...'. Ran on the test project on Nov 6 2026 after the migration: 24 of 24 passed
-- (before it, the same detailer read 4 bookings with 2 phone numbers, 2 emails, 4 totals and 4 line prices).
-- Results accumulate under the label prefix: read the latest run with
--   select label, passed, detail from tst.results where label like 'm007s:%' order by id desc limit 24;
do $$
declare
  p text := 'm007s';
  det uuid := '00000000-0000-4000-8000-0000000000c1';
  mgr uuid := '00000000-0000-4000-8000-0000000000b1';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  cus uuid := '00000000-0000-4000-8000-0000000000d1';
  n_all int; n_det int; n_mgr int; n_open int; photo text;
  mine_only boolean; no_prices boolean; got int; far date := current_date + 400; job uuid; can_see boolean; photo_err text;
begin
  -- what each one should see, counted as the database owner
  select count(*) into n_all from public.appointments;
  select count(*) into n_det from public.appointments a
   where exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id and x.employee_id = det)
     and a.status in ('confirmed', 'in_progress', 'completed') and a.anonymized_at is null and a.service_date >= public.local_today() - 14;
  select count(*) into n_mgr from public.appointments a
   where exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id and x.employee_id = mgr)
     and a.status in ('confirmed', 'in_progress', 'completed') and a.anonymized_at is null and a.service_date >= public.local_today() - 14;
  select count(*) into n_open from public.appointments a
   where a.status = 'confirmed' and a.service_date between public.local_today() and public.local_today() + 14
     and not exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id);
  select a.photo_paths[1] into photo from public.appointments a
   where cardinality(a.photo_paths) > 0 and exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id and x.employee_id = det) limit 1;
  perform tst.ok(n_det > 0, p || ': fixture: the detailer has assigned jobs (' || n_det || ')');

  -- the function's shape: nothing a detailer must not see (doc 28)
  perform tst.ok(not exists (select 1 from pg_proc where proname = 'my_jobs' and proargnames && array['contact_first', 'contact_last', 'contact_phone', 'contact_email', 'customer_id', 'value_cents', 'total_cents', 'extra_cost_cents', 'extra_cost_note', 'price_cents', 'mobile_cents']),
    p || ': my_jobs returns no contact or price columns');
  perform tst.ok(not has_function_privilege('anon', 'public.my_jobs(date)', 'execute'), p || ': visitors can''t run my_jobs');

  -- a detailer: nothing from the tables themselves, their own jobs through my_jobs
  perform tst.login(det);
  execute 'set local role authenticated';
  perform tst.eq((select count(*)::text from public.appointments), '0', p || ': a detailer reads no booking rows from the table (no phone, email or price)');
  perform tst.eq((select count(*)::text from public.appointment_items), '0', p || ': a detailer reads no booking lines from the table (no prices)');
  perform tst.eq((select count(*)::text from public.appointment_events), '0', p || ': a detailer reads no booking history from the table');
  got := (select count(*) from public.my_jobs());
  perform tst.eq(got::text, n_det::text, p || ': my_jobs lists the detailer''s assigned jobs');
  select bool_and(exists (select 1 from public.appointment_assignments x where x.appointment_id = j.id and x.employee_id = det)) into mine_only from public.my_jobs() j;
  perform tst.ok(coalesce(mine_only, true), p || ': my_jobs lists only their own jobs');
  select coalesce(bool_and(not (i ? 'price_cents') and not (i ? 'mobile_cents') and i ? 'code' and i ? 'name'), true) into no_prices from public.my_jobs() j, jsonb_array_elements(j.items) i;
  perform tst.ok(no_prices, p || ': my_jobs lines have code and name, no prices');
  perform tst.ok((select count(*) from public.my_jobs() j where jsonb_array_length(j.items) > 0) = got, p || ': every job comes with its lines');
  perform tst.eq((select count(*)::text from public.my_jobs(far)), '0', p || ': p_from limits the days');
  perform tst.eq((select count(*)::text from public.open_jobs()), n_open::text, p || ': open_jobs still lists the open jobs for a detailer');
  perform tst.ok(photo is null or public.can_view_vehicle_photo(photo), p || ': the customer''s photos of an assigned job can still be opened' || case when photo is null then ' (no photo in the fixtures)' else '' end);
  execute 'reset role';
  -- the same with a photo put on one of the detailer's jobs for the moment (rolled back at once)
  begin
    select a.id, coalesce(a.customer_id::text, 'guest') || '/' || gen_random_uuid() || '.jpg' into job, photo from public.appointments a
     where exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id and x.employee_id = det) limit 1;
    execute format('update public.appointments set photo_paths = array[%L] where id = %L', photo, job);
    execute 'set local role authenticated';
    can_see := public.can_view_vehicle_photo(photo);
    execute 'reset role';
    raise exception 'm007s_undo';
  exception when others then
    if sqlerrm <> 'm007s_undo' then can_see := null; photo_err := sqlerrm; end if;
  end;
  perform tst.ok(can_see, p || ': an assigned detailer can still open a photo of their job', photo_err);
  execute 'set local role authenticated';
  perform tst.ok((select count(*) from public.appointment_assignments) > 0, p || ': a detailer still reads their own assignments');
  execute 'reset role';

  -- a manager: the authenticator first; then every booking from the table, their own jobs through my_jobs
  perform tst.login(mgr, 'aal1');
  execute 'set local role authenticated';
  perform tst.err('select * from public.my_jobs()', 'mfa_required', p || ': manager at aal1: my_jobs asks for the authenticator');
  perform tst.eq((select count(*)::text from public.appointments), '0', p || ': manager at aal1 reads no bookings');
  execute 'reset role';
  perform tst.login(mgr, 'aal2');
  execute 'set local role authenticated';
  perform tst.eq((select count(*)::text from public.appointments), n_all::text, p || ': manager at aal2 reads every booking (the Admin page)');
  perform tst.ok((select count(*) from public.appointment_items) > 0, p || ': manager at aal2 reads the booking lines');
  perform tst.eq((select count(*)::text from public.my_jobs()), n_mgr::text, p || ': manager at aal2: my_jobs lists only their own jobs, not every booking');
  execute 'reset role';

  -- the admin at aal2: the whole table, as before
  perform tst.login(adm, 'aal2');
  execute 'set local role authenticated';
  perform tst.eq((select count(*)::text from public.appointments), n_all::text, p || ': the admin reads every booking');
  perform tst.ok((select count(*) from public.appointment_events) > 0, p || ': the admin reads the booking history');
  execute 'reset role';

  -- a customer: not for them
  perform tst.login(cus);
  execute 'set local role authenticated';
  perform tst.err('select * from public.my_jobs()', 'not_allowed', p || ': a customer can''t run my_jobs');
  perform tst.eq((select count(*)::text from public.appointments), '0', p || ': a customer reads no booking rows');
  execute 'reset role';
end $$;
select label, passed, detail from tst.results where label like 'm007s:%' order by id desc limit 24;
