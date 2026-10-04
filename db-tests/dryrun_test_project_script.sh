#!/bin/bash
# Local dry run of build/alchemist-test-project-setup.sql, sent as ONE query
# the way Supabase's SQL Editor sends it (tests/run_as_one_query.py):
#   0. on a database without the test-project marker: must stop, change nothing
#   1. reference: a fresh database, the six files applied one by one, fingerprints
#   2. a database in the test project's current state (unfinished run of
#      files 1 to 3, http extension installed, three migration records), then
#      the script; its fingerprints must equal the reference
#   3. the script again on the same database (clearing a full earlier run)
set -uo pipefail
export PGHOST=/home/claude/.pgtest PGPORT=54329 PGUSER=postgres
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
mig=$root/supabase/migrations
"$root/build/make_test_project_script.sh" || exit 1
script=$root/build/alchemist-test-project-setup.sql

fresh() {
  psql -qAtc "drop database if exists $1" -c "create database $1" > /dev/null
  psql -d "$1" -v ON_ERROR_STOP=1 -q -f "$here/local_supabase_stubs.sql" > /dev/null || exit 1
  psql -d "$1" -v ON_ERROR_STOP=1 -q -f "$here/local_dryrun_stubs.sql" > /dev/null || exit 1
}

echo "== 0. a project without the marker"
fresh m001other
psql -d m001other -qc "drop schema alchemist_test_project_marker" > /dev/null
python3 "$here/run_as_one_query.py" "$script" m001other
psql -d m001other -Atc "select 'public tables after: ' || count(*) from pg_tables where schemaname = 'public'"

echo "== 1. reference"
fresh m001ref
for f in "$mig"/*_m001_*.sql; do
  psql -d m001ref -v ON_ERROR_STOP=1 -1 -q -f "$f" > /dev/null || { echo "reference: $f failed"; exit 1; }
done
psql -d m001ref -v ON_ERROR_STOP=1 -1 -q -f "$here/fingerprint_into_table.sql" > /dev/null || { echo "reference fingerprints failed"; exit 1; }
psql -d m001ref -Atc "select part || ' ' || n || ' ' || md5 from alchemist_test_project_marker.check_results order by part"

fresh m001dry
for f in "$mig"/2026100320000[123]_*.sql; do
  psql -d m001dry -v ON_ERROR_STOP=1 -1 -q -f "$f" > /dev/null || exit 1
done
psql -d m001dry -v ON_ERROR_STOP=1 -q > /dev/null <<'EOF' || exit 1
create extension http with schema extensions;
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261003204829', 'm001_types_and_tables'), ('20261003205005', 'm001_roles_triggers_menu'),
  ('20261003205202', 'm001_pricing_availability_booking');
EOF

report() {
  if diff <(psql -d m001ref -Atc "select part, n, md5 from alchemist_test_project_marker.check_results order by part") \
          <(psql -d m001dry -Atc "select part, n, md5 from alchemist_test_project_marker.check_results order by part"); then
    echo "fingerprints: identical to the reference"
  else
    echo "fingerprints: DIFFERENT"
  fi
  psql -d m001dry -Atc "select 'checks passed: ' || count(*) filter (where passed) || ', failed: ' || count(*) filter (where not passed) from tst.results"
  psql -d m001dry -Atc "select id || ' | ' || label || ' | ' || coalesce(detail, '') from tst.results where not passed order by id"
  psql -d m001dry -Atc "select 'migrations recorded: ' || string_agg(version || ' ' || name, ', ' order by version) from supabase_migrations.schema_migrations"
  psql -d m001dry -Atc "select 'http extension still installed: ' || exists (select 1 from pg_extension where extname = 'http')"
  psql -d m001dry -Atc "select 'blocked email domains: ' || count(*) from public.blocked_email_domains"
}
echo "== 2. first run, from the test project's current state"
python3 "$here/run_as_one_query.py" "$script" m001dry
report
echo "== 3. second run, clearing the first"
python3 "$here/run_as_one_query.py" "$script" m001dry
report
