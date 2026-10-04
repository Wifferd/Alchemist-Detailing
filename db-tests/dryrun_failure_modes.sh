#!/bin/bash
# What the test-project script does when something fails part-way, sent as one
# query like the SQL Editor sends it. Run after tests/dryrun_test_project_script.sh
# (uses its database m001dry, which then holds a complete run).
#   a. a failure inside steps 1 to 3 (here: the blocklist download is wrong)
#      must leave the database exactly as it was
#   b. a failure inside the checks must keep steps 1 to 3 and the parts already
#      finished, and end with no transaction left open
set -uo pipefail
export PGHOST=/home/claude/.pgtest PGPORT=54329 PGUSER=postgres
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
script=$root/build/alchemist-test-project-setup.sql
scratch=$(mktemp -d)
state() {
  psql -d m001dry -Atc "select 'check_results taken at ' || coalesce((select max(taken_at)::text from alchemist_test_project_marker.check_results), 'none')
                        || '; test results: ' || (select count(*) from tst.results)
                        || '; public tables: ' || (select count(*) from pg_tables where schemaname = 'public')
                        || '; migrations recorded: ' || (select count(*) from supabase_migrations.schema_migrations)"
}

echo "== a. the download fails inside step 2"
state
psql -d m001dry -qc "update localstub.http_content set content = 'not-the-list.example'" > /dev/null
python3 "$here/run_as_one_query.py" "$script" m001dry
state
psql -d m001dry -qc "update localstub.http_content set content = pg_read_file('/home/claude/disposable-email-domains/disposable-email-domains/disposable_email_blocklist.conf')" > /dev/null

echo "== b. a statement fails inside the booking checks"
awk '{ print } /^-- 4\. m001_tests_booking\.sql$/ { getline; print; print "select 1/0;" }' "$script" > "$scratch/broken.sql"
grep -c '^select 1/0;$' "$scratch/broken.sql"
python3 "$here/run_as_one_query.py" "$scratch/broken.sql" m001dry
state
psql -d m001dry -Atc "select 'last saved check: ' || label from tst.results order by id desc limit 1"
rm -rf "$scratch"
