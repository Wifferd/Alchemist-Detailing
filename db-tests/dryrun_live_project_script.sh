#!/bin/bash
# Local dry run of build/alchemist-live-project-setup.sql, sent as ONE query
# the way Supabase's SQL Editor sends it (tests/run_as_one_query.py):
#   1. reference: a fresh database, the six files applied one by one
#   2. a fresh "live" database (no migration records yet, one-time marker):
#      the script must finish, and match the reference exactly
#   3. the script again on the same database: must stop, change nothing
#   4. a project without the marker, the test project, and a project with
#      something already in public: each must stop, change nothing
set -uo pipefail
export PGHOST=/home/claude/.pgtest PGPORT=54329 PGUSER=postgres
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
mig=$root/supabase/migrations
"$root/build/make_live_project_script.sh" || exit 1
script=$root/build/alchemist-live-project-setup.sql
ref=$(mktemp)

fresh() {   # fresh <db> <extra stubs file>
  psql -qAtc "drop database if exists $1" -c "create database $1" > /dev/null 2>&1
  psql -d "$1" -v ON_ERROR_STOP=1 -q -f "$here/local_supabase_stubs.sql" > /dev/null || exit 1
  psql -d "$1" -v ON_ERROR_STOP=1 -q -f "$2" > /dev/null || exit 1
}
prints() {  # object and price fingerprints of a database
  psql -d "$1" -Atc "set search_path = \"\$user\", public, extensions" -f "$here/fingerprint_ignoring_line_breaks.sql" | tr '|' ' '
  psql -d "$1" -At -f "$here/price_fingerprint_readonly.sql" | grep -v '^CREATE' | sed 's/^/prices (read-only) /' | tr '|' ' '
}
state() {
  psql -d "$1" -Atc "select 'public tables: ' || (select count(*) from pg_tables where schemaname = 'public')
    || '; marker: ' || exists (select 1 from pg_namespace where nspname = 'alchemist_production_marker')
    || '; migrations recorded: ' || coalesce((select count(*)::text from pg_tables where schemaname = 'supabase_migrations' and tablename = 'schema_migrations'), '0')"
}

echo "== 1. reference"
fresh m001liveref "$here/local_live_dryrun_stubs.sql"
for f in "$mig"/*_m001_*.sql; do
  psql -d m001liveref -v ON_ERROR_STOP=1 -1 -q -f "$f" > /dev/null || { echo "reference: $f failed"; exit 1; }
done
prints m001liveref > "$ref"
cat "$ref"

echo "== 2. the live script on a fresh live project"
fresh m001live "$here/local_live_dryrun_stubs.sql"
python3 "$here/run_as_one_query.py" "$script" m001live
state m001live
psql -d m001live -Atc "select 'recorded: ' || string_agg(version || ' ' || name, ', ' order by version) from supabase_migrations.schema_migrations"
psql -d m001live -Atc "select 'http extension still installed: ' || exists (select 1 from pg_extension where extname = 'http')"
psql -d m001live -Atc "select 'tables without RLS: ' || count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity"
if diff "$ref" <(prints m001live); then echo "fingerprints: identical to the reference"; else echo "fingerprints: DIFFERENT"; fi

echo "== 3. the same script a second time"
python3 "$here/run_as_one_query.py" "$script" m001live
state m001live

echo "== 4a. a project without the marker"
fresh m001live_other "$here/local_live_dryrun_stubs.sql"
psql -d m001live_other -qc "drop schema alchemist_production_marker" > /dev/null
python3 "$here/run_as_one_query.py" "$script" m001live_other
state m001live_other
echo "== 4b. the test project (both markers present)"
fresh m001live_test "$here/local_live_dryrun_stubs.sql"
psql -d m001live_test -qc "create schema alchemist_test_project_marker" > /dev/null
python3 "$here/run_as_one_query.py" "$script" m001live_test
state m001live_test
echo "== 4c. a project with something already in public (like Supabase's automatic-RLS helper)"
fresh m001live_busy "$here/local_live_dryrun_stubs.sql"
psql -d m001live_busy -qc "create function public.rls_auto_enable() returns event_trigger language plpgsql as \$\$ begin end \$\$" > /dev/null
python3 "$here/run_as_one_query.py" "$script" m001live_busy
state m001live_busy
for d in m001live_other m001live_test m001live_busy; do psql -qAtc "drop database if exists $d" > /dev/null; done
rm -f "$ref"
