#!/bin/bash
# Runs Migration 001 and its tests on a fresh local Postgres database.
# Usage: tests/run_local.sh [test files...]   (defaults to every m001_tests_*.sql)
set -uo pipefail
export PGHOST=${PGHOST:-/home/claude/.pgtest} PGPORT=${PGPORT:-54329} PGUSER=${PGUSER:-postgres}
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
db=m001
blocklist=/home/claude/disposable-email-domains/disposable-email-domains/disposable_email_blocklist.conf

"$root/build/assemble.sh" > /dev/null
psql -qAtc "drop database if exists $db" -c "create database $db" > /dev/null
psql -d $db -v ON_ERROR_STOP=1 -q -f "$here/local_supabase_stubs.sql" > /dev/null || exit 1
if ! psql -d $db -v ON_ERROR_STOP=1 -1 -q -f "$root/build/migration_001_foundation.sql" > /dev/null; then
  echo "MIGRATION FAILED"; exit 1
fi
psql -d $db -v ON_ERROR_STOP=1 -q -c "\copy public.blocked_email_domains (domain) from '$blocklist'" > /dev/null
psql -d $db -v ON_ERROR_STOP=1 -q -f "$here/m001_framework.sql" > /dev/null || exit 1
psql -d $db -v ON_ERROR_STOP=1 -q -f "$here/m001_fixtures.sql" > /dev/null || { echo "FIXTURES FAILED"; exit 1; }

files=("$@")
if [ ${#files[@]} -eq 0 ]; then files=("$here"/m001_tests_*.sql); fi
for f in "${files[@]}"; do
  if ! psql -d $db -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null 2> /tmp/m001_err.txt; then
    echo "SCRIPT STOPPED in $(basename "$f"):"; cat /tmp/m001_err.txt
  fi
done
psql -d $db -Atc "select 'passed: ' || count(*) filter (where passed) || ', failed: ' || count(*) filter (where not passed) from tst.results"
psql -d $db -Atc "select id || ' | ' || label || ' | ' || coalesce(detail, '') from tst.results where not passed order by id"
