-- Migration 006: managers and the admin need their authenticator code (aal2) for team reads too.
-- Needs the m001 framework and fixtures (test project only). One DO block, so it runs as a single query
-- through the Supabase MCP. Pass the label prefix as the first word, so the same block can run before the
-- migration ('m006pre', where the manager and admin checks are expected to fail) and after it ('m006').
-- Read the results with: select label, passed, detail from tst.results where label like 'm006:%' order by id;
do $$
declare
  p text := 'm006';   -- set to 'm006pre' for the run before the migration
  mgr uuid := '00000000-0000-4000-8000-0000000000b1';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  det uuid := '00000000-0000-4000-8000-0000000000c1';
  cus uuid := '00000000-0000-4000-8000-0000000000d1';
  n_all int; n_det int; n_det_notes int; n_cus_notes int; n_mgr_notes int; n_adm_notes int;
begin
  -- what each one should see, counted as the database owner
  select count(*) into n_all from public.appointments;
  select count(distinct a.appointment_id) into n_det from public.appointment_assignments a where a.employee_id = det;
  select count(*) into n_det_notes from public.notifications where recipient_id = det;
  select count(*) into n_cus_notes from public.notifications where recipient_id = cus;
  select count(*) into n_mgr_notes from public.notifications where recipient_id = mgr;
  select count(*) into n_adm_notes from public.notifications where recipient_id = adm;
  perform tst.ok(exists (select 1 from public.appointment_assignments where employee_id = mgr), p || ': fixture: the manager has an assigned job');

  -- the manager with the password step only (aal1): nothing of the team's
  perform tst.login(mgr, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not public.is_staff(), p || ': manager at aal1 is not staff');
  perform tst.eq((select count(*)::text from public.appointments), '0', p || ': manager at aal1 sees no bookings, not even an assigned one');
  perform tst.eq((select count(*)::text from public.appointment_items), '0', p || ': manager at aal1 sees no booking lines');
  perform tst.eq((select count(*)::text from public.appointment_events), '0', p || ': manager at aal1 sees no booking history');
  perform tst.eq((select count(*)::text from public.notifications), '0', p || ': manager at aal1 sees no notices');
  perform tst.err('select * from public.open_jobs()', 'mfa_required', p || ': manager at aal1: open_jobs asks for the authenticator');
  execute 'reset role';

  -- the same manager after the authenticator code (aal2): as before
  perform tst.login(mgr, 'aal2');
  execute 'set local role authenticated';
  perform tst.ok(public.is_staff(), p || ': manager at aal2 is staff');
  perform tst.eq((select count(*)::text from public.appointments), n_all::text, p || ': manager at aal2 sees every booking');
  perform tst.eq((select count(*)::text from public.notifications), n_mgr_notes::text, p || ': manager at aal2 sees their notices');
  perform tst.ok((select count(*) >= 0 from public.open_jobs()), p || ': manager at aal2: open_jobs answers');
  execute 'reset role';

  -- the admin, the same two ways
  perform tst.login(adm, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not public.is_staff(), p || ': admin at aal1 is not staff');
  perform tst.eq((select count(*)::text from public.appointments), '0', p || ': admin at aal1 sees no bookings');
  perform tst.eq((select count(*)::text from public.notifications), '0', p || ': admin at aal1 sees no notices');
  perform tst.err('select * from public.open_jobs()', 'mfa_required', p || ': admin at aal1: open_jobs asks for the authenticator');
  execute 'reset role';
  perform tst.login(adm, 'aal2');
  execute 'set local role authenticated';
  perform tst.eq((select count(*)::text from public.appointments), n_all::text, p || ': admin at aal2 sees every booking');
  perform tst.eq((select count(*)::text from public.notifications), n_adm_notes::text, p || ': admin at aal2 sees their notices');
  execute 'reset role';

  -- a detailer has no authenticator step: unchanged at aal1
  perform tst.login(det, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(public.is_staff(), p || ': detailer at aal1 is staff');
  -- since Migration 007s a detailer reads their bookings through my_jobs(), not the table (doc 28)
  perform tst.eq((select count(*)::text from public.appointments), '0', p || ': detailer reads no bookings from the table (Migration 007s)');
  perform tst.eq((select count(*)::text from public.notifications), n_det_notes::text, p || ': detailer sees their notices');
  perform tst.ok((select count(*) >= 0 from public.open_jobs()), p || ': detailer: open_jobs answers');
  execute 'reset role';

  -- a customer: unchanged
  perform tst.login(cus, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not public.is_staff(), p || ': customer is not staff');
  perform tst.eq((select count(*)::text from public.notifications), n_cus_notes::text, p || ': customer sees their notices');
  perform tst.err('select * from public.open_jobs()', 'not_allowed', p || ': customer: open_jobs is for the team');
  execute 'reset role';
  perform tst.logout();
end $$;
select label, passed, detail from tst.results where label like 'm006:%' order by id;
