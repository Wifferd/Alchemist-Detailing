#!/bin/bash
# W-16: simultaneous bookings for one slot. Two sessions race for the same
# mobile time; the day lock must make the second wait, then refuse it.
# Run after run_local.sh (uses its database and test logins).
set -uo pipefail
export PGHOST=${PGHOST:-/home/claude/.pgtest} PGPORT=${PGPORT:-54329} PGUSER=${PGUSER:-postgres}
db=m001
tmp=$(mktemp -d)

session() { # $1 = login id, $2 = aal, $3 = SQL to run, $4 = output file
  psql -d $db -At -v ON_ERROR_STOP=0 > "$4" 2>&1 <<SQL
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated', 'aal', '$2')::text, true);
set local role authenticated;
select 'start ' || clock_timestamp();
$3
select pg_sleep(3);
select 'end ' || clock_timestamp();
commit;
SQL
}

record() { # $1 = passed (true/false), $2 = label, $3 = detail
  psql -d $db -q -c "insert into tst.results (label, passed, detail) values (\$l\$$2\$l\$, $1, \$d\$$3\$d\$)"
}

# 1. Two customers send a request for overlapping mobile times on the same day.
session 00000000-0000-4000-8000-0000000000d4 aal1 "select 'ref ' || (public.submit_booking(tst.booking('mobile', tst.d(25), 600)) ->> 'ref');" $tmp/s1.txt &
sleep 1
start=$(date +%s.%N)
session 00000000-0000-4000-8000-0000000000d6 aal1 "select 'ref ' || (public.submit_booking(tst.booking('mobile', tst.d(25), 630)) ->> 'ref');" $tmp/s2.txt
end=$(date +%s.%N)
wait
waited=$(echo "$end - $start" | bc)
grep -q '^ref AD-' $tmp/s1.txt && s1ok=true || s1ok=false
grep -q 'slot_unavailable' $tmp/s2.txt && s2refused=true || s2refused=false
record $s1ok "race: the first request is saved" "$(cat $tmp/s1.txt | tr '\n' ' ')"
record $s2refused "race: the second request waits for the first, then is refused" "waited ${waited}s: $(cat $tmp/s2.txt | tr '\n' ' ')"
n=$(psql -d $db -Atc "select count(*) from public.appointments where service_date = tst.d(25) and location_type = 'mobile'")
[ "$n" = "1" ] && ok=true || ok=false
record $ok "race: only one mobile job on the calendar" "count $n"

# 2. A manager moves a job onto a day while a customer requests the same time.
s3=$(psql -d $db -Atc "select v from tst.vars where k = 's3'")
session 00000000-0000-4000-8000-0000000000b1 aal2 "select 'moved ' || (public.set_booking_time('$s3', tst.d(26), 600)).start_min;" $tmp/m1.txt &
sleep 1
session 00000000-0000-4000-8000-0000000000d4 aal1 "select 'ref ' || (public.submit_booking(tst.booking('mobile', tst.d(26), 630)) ->> 'ref');" $tmp/m2.txt
wait
grep -q '^moved 600' $tmp/m1.txt && ok1=true || ok1=false
grep -q 'slot_unavailable' $tmp/m2.txt && ok2=true || ok2=false
record $ok1 "race: the manager's time change is saved" "$(cat $tmp/m1.txt | tr '\n' ' ')"
record $ok2 "race: a customer request for the same time waits, then is refused" "$(cat $tmp/m2.txt | tr '\n' ' ')"

# 3. Two managers assign the same person to two overlapping mobile jobs at once.
s5=$(psql -d $db -Atc "select v from tst.vars where k = 's5'")
s6=$(psql -d $db -Atc "select v from tst.vars where k = 's6'")
session 00000000-0000-4000-8000-0000000000b1 aal2 "select 'assigned ' || public.assign_employee('$s5', '00000000-0000-4000-8000-0000000000c2')::text;" $tmp/p1.txt &
sleep 1
session 00000000-0000-4000-8000-0000000000a1 aal2 "select 'assigned ' || public.assign_employee('$s6', '00000000-0000-4000-8000-0000000000c2')::text;" $tmp/p2.txt
wait
grep -q '^assigned' $tmp/p1.txt && ok1=true || ok1=false
grep -q 'slot_unavailable' $tmp/p2.txt && ok2=true || ok2=false
record $ok1 "race: the first assignment is saved" "$(cat $tmp/p1.txt | tr '\n' ' ')"
record $ok2 "race: the same person can't be put on an overlapping mobile job at the same moment" "$(cat $tmp/p2.txt | tr '\n' ' ')"

# 4. A manager confirms a lapsed request while a customer requests its time.
psql -d $db -q -c "update public.business_settings set max_open_requests_per_customer = 30, max_requests_per_customer_per_day = 60" > /dev/null
lapsed=$(psql -d $db -At -c "select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-4000-8000-0000000000d1\",\"role\":\"authenticated\"}', false)" -c "set role authenticated" -c "select public.submit_booking(tst.booking('mobile', tst.d(45), 600)) ->> 'id'" | tail -1)
psql -d $db -q -c "update public.appointments set hold_expires_at = now() - interval '1 minute' where id = '$lapsed'" > /dev/null
session 00000000-0000-4000-8000-0000000000b1 aal2 "select 'confirmed ' || (public.confirm_booking('$lapsed')).status;" $tmp/c1.txt &
sleep 1
session 00000000-0000-4000-8000-0000000000d4 aal1 "select 'ref ' || (public.submit_booking(tst.booking('mobile', tst.d(45), 630)) ->> 'ref');" $tmp/c2.txt
wait
grep -q '^confirmed confirmed' $tmp/c1.txt && ok1=true || ok1=false
grep -q 'slot_unavailable' $tmp/c2.txt && ok2=true || ok2=false
record $ok1 "race: confirming a lapsed request is saved" "$(cat $tmp/c1.txt | tr '\n' ' ')"
record $ok2 "race: a new request for that time waits, then is refused" "$(cat $tmp/c2.txt | tr '\n' ' ')"

# 5. Two admins try to demote each other at the same moment: one admin must remain.
psql -d $db -At -c "select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-4000-8000-0000000000a1\",\"role\":\"authenticated\",\"aal\":\"aal2\"}', false)" -c "set role authenticated" -c "select public.set_user_role('00000000-0000-4000-8000-0000000000b1', 'admin')" > /dev/null
session 00000000-0000-4000-8000-0000000000a1 aal2 "select 'demoted ' || (public.set_user_role('00000000-0000-4000-8000-0000000000b1', 'manager')).role;" $tmp/d1.txt &
sleep 1
session 00000000-0000-4000-8000-0000000000b1 aal2 "select 'demoted ' || (public.set_user_role('00000000-0000-4000-8000-0000000000a1', 'customer')).role;" $tmp/d2.txt
wait
n=$(psql -d $db -Atc "select count(*) from public.profiles where role = 'admin' and is_active")
grep -q 'wrong_state' $tmp/d2.txt && ok2=true || ok2=false
[ "$n" = "1" ] && ok=true || ok=false
record $ok "race: one admin always remains" "admins: $n; $(cat $tmp/d1.txt | tr '\n' ' ')"
record $ok2 "race: the second demotion waits, then is refused" "$(cat $tmp/d2.txt | tr '\n' ' ')"

# 6. A manager enters a booking for a customer while the admin removes that customer.
session 00000000-0000-4000-8000-0000000000b1 aal2 "select 'entered ' || (public.staff_create_booking(tst.booking('shop', tst.d(48), 600, '{\"customer_id\":\"00000000-0000-4000-8000-0000000000e5\"}'))).status;" $tmp/x1.txt &
sleep 1
session 00000000-0000-4000-8000-0000000000a1 aal2 "select 'removed ' || public.anonymize_customer('00000000-0000-4000-8000-0000000000e5')::text;" $tmp/x2.txt
wait
grep -q '^entered confirmed' $tmp/x1.txt && ok1=true || ok1=false
grep -q 'wrong_state' $tmp/x2.txt && ok2=true || ok2=false
record $ok1 "race: the manager's entry for a customer is saved" "$(cat $tmp/x1.txt | tr '\n' ' ')"
record $ok2 "race: removing that customer at the same moment waits, then is refused (open booking)" "$(cat $tmp/x2.txt | tr '\n' ' ')"

psql -d $db -Atc "select 'passed: ' || count(*) filter (where passed) || ', failed: ' || count(*) filter (where not passed) from tst.results"
psql -d $db -Atc "select label || ' | ' || coalesce(detail, '') from tst.results where label like 'race:%' order by id"
rm -rf $tmp
