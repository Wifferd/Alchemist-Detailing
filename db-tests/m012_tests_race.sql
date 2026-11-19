-- Migration 012: two requests for one First Timer Deal at the same moment. save_booking (part 3) keeps Migration 011's
-- phone and address locks and their order (the caller's day lock 7302, then 7311 for the phone, then 7312 for the street
-- address); only where the deal comes from changed. Every block ends by raising its result, so nothing is kept and no
-- booking alert is sent.
--
-- Block L (one session; run on the test project Nov 19, 2026 through the MCP): a guest Basic Wash + Interior Clean (the
-- Both deal) holds the guest lock (7305), the day lock (7302), the phone lock (7311, hashtext of the normalized phone)
-- and the address lock (7312, hashtext of address_key).
-- Result on Nov 19: "M012 LOCKS: deal both, total 7999, advisory locks held: 7311:true, 7312:true ;
--                    all advisory: 7302,7305,7311,7312".
--
-- Two sessions at once: the Supabase MCP runs execute_sql calls one after another, so it can't overlap them. Use blocks
-- A and B of m011_tests_race.sql from two SQL Editor tabs, with the Both deal: add
--   'interior', 'interior_clean', 'conditions', jsonb_build_array('none')
-- to both jsonb_build_object calls. What they prove (and the commit variant A2 for a full proof on TEST, with the booking
-- alert off and the booking cancelled afterwards with office.cancel) is written there; the lock code is unchanged.

-- ---------------------------------------------------------------- block L
do $$
declare
  ap public.appointments;
  v text;
begin
  ap := tst.m011_guest(jsonb_build_object('phone', '(469) 821-9901', 'address', '9901 Larkspur Lane', 'address_zip', '75002',
                                          'interior', 'interior_clean', 'conditions', jsonb_build_array('none'),
                                          'special_request', 'm012 test', 'from_day', 5));
  select string_agg(classid || ':' || (objid::int = hashtext(case classid when 7311 then '14698219901'
                                       else public.address_key('9901 Larkspur Lane', '75002') end))::text, ', ' order by classid)
    into v
    from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and classid in (7311, 7312) and objsubid = 2 and granted;
  raise exception 'M012 LOCKS: deal %, total %, advisory locks held: % ; all advisory: %', ap.first_visit_deal, ap.total_cents, v,
    (select string_agg(classid::text, ',' order by classid) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid());
end
$$;
