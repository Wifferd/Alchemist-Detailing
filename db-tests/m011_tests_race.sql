-- Migration 011: two requests for one first-time offer at the same moment (save_booking's phone and address locks).
-- Every block ends by raising its result, so nothing is kept and no booking alert is sent (see m011_tests_menu.sql).
--
-- Block L (one session; run on the test project Nov 17, 2026 through the MCP):
--   a guest Basic Wash, then a look at pg_locks: the request holds the guest lock (7305), the day lock (7302), the
--   phone lock (7311, hashtext of the normalized phone) and the address lock (7312, hashtext of address_key).
--   Result on Nov 17: "offer t, advisory locks held: 7311:true, 7312:true ; all advisory: 7302,7305,7311,7312".
--
-- Blocks A and B (two sessions at once): the Supabase MCP runs execute_sql calls one after another (two calls sent
-- together ran 18:12:42-18:12:50 and 18:12:52-18:12:54), so it can't overlap them, and dblink isn't installed. Run A
-- and B from two SQL Editor tabs (or two psql sessions) started within a second of each other:
--   A: a guest Basic Wash for phone P on day D1, then holds its transaction open for 8 seconds;
--   B: 2 seconds later, a signed-in customer whose confirmed phone is P sends a Basic Wash on another day D2.
-- They share no day lock (different days) and no guest lock (B is not a guest), so only the 7311 phone lock can make B
-- wait.
--
-- What A and B as written prove, and what they don't (verifier S-3, Nov 17):
--   - They prove only that B WAITS on the phone lock: B's "saved" time is after A's end (about 6 seconds later), with
--     no deadlock and both finishing.
--   - They do NOT prove that B then loses the offer. A ends by raising, so its booking rolls back and B rightly gets the
--     offer whether the lock works or not.
--   - What makes the outcome right is read from the code: pg_advisory_xact_lock is released only at commit; save_booking
--     is volatile, so in READ COMMITTED its first_visit_eligible statement after the lock takes a fresh snapshot and
--     sees A's committed row; every path normalizes the phone; and the lock order is day, then phone, then address on
--     every path, so no deadlock cycle is possible. The same-transaction checks in m011_tests_menu.sql (C5-C7,
--     C39-C41, D6-D7) show that a booking that exists when the lock is granted takes the offer away.
--
-- For a real proof (TEST only, owner's choice): turn the Migration 010 booking alert off first, then run A2 below (A
-- with a commit instead of the final raise) in tab 1 and B in tab 2. Expected: B waits, then saves with offer f
-- (regular price). Afterwards cancel A2's booking with office.cancel('<its ref>') and turn the alert back on. For the
-- address lock, give B another phone and A's street spelled differently ('9901 quillfeather ln').
--
--   -- block A2 (commits; run only on TEST, alert off):
--   select (tst.m011_guest(jsonb_build_object('phone', '(469) 820-9901', 'address', '9901 Quillfeather Lane',
--            'address_zip', '75002', 'from_day', 5))).ref, pg_sleep(8);

-- ---------------------------------------------------------------- block L
do $$
declare
  ap public.appointments;
  v text;
begin
  ap := tst.m011_guest(jsonb_build_object('phone', '(469) 820-9901', 'address', '9901 Quillfeather Lane', 'address_zip', '75002', 'from_day', 5));
  select string_agg(classid || ':' || (objid::int = hashtext(case classid when 7311 then '14698209901'
                                       else public.address_key('9901 Quillfeather Lane', '75002') end))::text, ', ' order by classid)
    into v
    from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and classid in (7311, 7312) and objsubid = 2 and granted;
  raise exception 'M011 LOCKS: offer %, advisory locks held: % ; all advisory: %', ap.first_visit_offer, v,
    (select string_agg(classid::text, ',' order by classid) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid());
end
$$;

-- ---------------------------------------------------------------- block A
do $$
declare
  ap public.appointments;
  t0 timestamptz := clock_timestamp();
begin
  ap := tst.m011_guest(jsonb_build_object('phone', '(469) 820-9901', 'address', '9901 Quillfeather Lane', 'address_zip', '75002', 'from_day', 5));
  perform pg_sleep(8);
  raise exception 'M011 RACE A: start %, end %, offer %', to_char(t0, 'HH24:MI:SS.MS'), to_char(clock_timestamp(), 'HH24:MI:SS.MS'), ap.first_visit_offer;
end
$$;

-- ---------------------------------------------------------------- block B
do $$
declare
  u uuid;
  ap public.appointments;
  t0 timestamptz := clock_timestamp();
  t1 timestamptz;
begin
  perform pg_sleep(2);
  u := tst.m011_user('14698209901', 40);
  t1 := clock_timestamp();
  ap := tst.m011_account(u, jsonb_build_object('address', '77 Marigold Court', 'address_zip', '75002', 'from_day', 20));
  raise exception 'M011 RACE B: start %, booking sent %, saved %, offer %', to_char(t0, 'HH24:MI:SS.MS'), to_char(t1, 'HH24:MI:SS.MS'),
    to_char(clock_timestamp(), 'HH24:MI:SS.MS'), ap.first_visit_offer;
end
$$;
