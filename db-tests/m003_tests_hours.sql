-- Migration 003: weekly hours. Needs the m001 framework and fixtures, and the migration applied.
-- Written as one DO block so it runs as a single query through the Supabase MCP
-- (top-level "set role" statements hang there). Ran on the test project on
-- Oct 5 2026: 25 of 25 passed. Read the results with:
--   select * from tst.results where label like 'm003%' order by 1;
do $$
declare mon date;
begin
  delete from tst.results where label like 'm003%';
  -- A Monday 46 to 52 days ahead: inside the booking window, clear of the fixtures' days.
  perform tst.setv('m003mon', (current_date + 46 + ((8 - extract(isodow from current_date + 46)::int) % 7))::text);
  mon := tst.getv('m003mon')::date;

  execute 'set local role anon';
  -- Monday to Thursday: a job must be done by 4 PM.
  perform tst.eq((select max(x)::text from unnest(public.get_availability(mon, 60, 'mobile')) x), '900', 'm003: Monday, 60 min: last start 3:00 PM');
  perform tst.ok(not (960 = any (public.get_availability(mon, 60, 'mobile'))), 'm003: Monday 4:00 PM is closed');
  perform tst.ok(not (930 = any (public.get_availability(mon, 60, 'mobile'))), 'm003: Monday 3:30 PM, 60 min: would run into the closure');
  perform tst.eq((select max(x)::text from unnest(public.get_availability(mon, 210, 'shop')) x), '750', 'm003: Monday, 3.5 h: last start 12:30 PM');
  perform tst.eq((select max(x)::text from unnest(public.get_availability(mon + 3, 60, 'mobile')) x), '900', 'm003: Thursday, 60 min: last start 3:00 PM');
  -- Friday: nothing may touch noon to 5 PM; the morning and the evening are open.
  perform tst.ok(not exists (select 1 from unnest(public.get_availability(mon + 4, 60, 'mobile')) x where x > 660 and x < 1020), 'm003: Friday, 60 min: no start from 11:30 AM to 4:30 PM');
  perform tst.ok(660 = any (public.get_availability(mon + 4, 60, 'mobile')), 'm003: Friday 11:00 AM, 60 min: done by noon');
  perform tst.ok(1020 = any (public.get_availability(mon + 4, 60, 'mobile')), 'm003: Friday 5:00 PM is open');
  perform tst.ok(1140 = any (public.get_availability(mon + 4, 60, 'mobile')), 'm003: Friday 7:00 PM, 60 min: done by 8');
  perform tst.ok(not (600 = any (public.get_availability(mon + 4, 150, 'mobile'))), 'm003: Friday 10:00 AM, 2.5 h: would run into Jummah');
  -- Saturday and Sunday: the full day.
  perform tst.ok(960 = any (public.get_availability(mon + 5, 60, 'mobile')), 'm003: Saturday 4:00 PM is open');
  perform tst.ok(1140 = any (public.get_availability(mon + 6, 60, 'shop')), 'm003: Sunday 7:00 PM is open');
  -- The calendar still shows every day (the mornings are free).
  perform tst.eq((select count(*)::text from public.get_calendar(mon, 7, 60, 'mobile') c where c.available), '7', 'm003: all seven days have open times');
  -- Visitors see the hours in the public settings but not the table.
  perform tst.eq((select jsonb_array_length(public.get_public_settings() -> 'weekly_closures')::text), '5', 'm003: five weekly closures in the public settings');
  perform tst.err('select * from public.weekly_closures', '42501', 'm003: visitors can''t read the table');
  execute 'reset role';

  -- Every booking path asks the same question.
  perform tst.ok(not public.slot_is_bookable(mon, 990, 60, 'mobile'), 'm003: Monday 4:30 PM is not bookable');
  perform tst.ok(public.slot_is_bookable(mon + 5, 990, 60, 'mobile'), 'm003: Saturday 4:30 PM is bookable');
  perform tst.ok(not public.slot_is_bookable(mon, 990, 60, 'mobile', null, true), 'm003: staff can''t book into a closure either');

  -- A customer can't read or change them; the admin can.
  perform tst.login('00000000-0000-4000-8000-0000000000d1');
  execute 'set local role authenticated';
  perform tst.eq((select count(*)::text from public.weekly_closures), '0', 'm003: a customer sees no rows');
  perform tst.err($q$insert into public.weekly_closures (weekday, start_min, end_min) values (6, 600, 660)$q$, '42501', 'm003: a customer can''t add one');
  execute 'reset role';
  perform tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
  execute 'set local role authenticated';
  perform tst.eq((select count(*)::text from public.weekly_closures), '5', 'm003: the admin reads them');
  perform tst.eq(tst.q($q$insert into public.weekly_closures (weekday, start_min, end_min, reason) values (6, 600, 660, 'test') returning weekday::text$q$), '6', 'm003: the admin adds one');
  perform tst.ok(not (600 = any (public.get_availability(mon + 5, 60, 'mobile'))), 'm003: Saturday 10:00 AM is closed by the new row');
  perform tst.eq(tst.q($q$delete from public.weekly_closures where reason = 'test' returning 'gone'$q$), 'gone', 'm003: the admin removes it');
  perform tst.ok(600 = any (public.get_availability(mon + 5, 60, 'mobile')), 'm003: Saturday 10:00 AM is open again');
  execute 'reset role';
end $$;
select * from tst.results where label like 'm003%' order by 1;
