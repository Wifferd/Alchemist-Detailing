#!/bin/bash
# Checks that applying Migration 001 one file at a time never leaves a table or
# function reachable from the website before file 5 sets the access rules.
set -uo pipefail
export PGHOST=${PGHOST:-/home/claude/.pgtest} PGPORT=${PGPORT:-54329} PGUSER=${PGUSER:-postgres}
here=$(cd "$(dirname "$0")" && pwd); root=$(dirname "$here"); db=m001partial
psql -qAtc "drop database if exists $db" -c "create database $db" > /dev/null
psql -d $db -v ON_ERROR_STOP=1 -q -f "$here/local_supabase_stubs.sql" > /dev/null
fail=0
for f in "$root"/supabase/migrations/2026100320000[1-5]_*.sql; do
  psql -d $db -v ON_ERROR_STOP=1 -1 -q -f "$f" > /dev/null || { echo "FAILED $f"; exit 1; }
  open=$(psql -d $db -Atc "
    select coalesce(string_agg(x, ', '), '') from (
      select 'table ' || table_name || ':' || grantee as x from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
      union all
      select 'function ' || routine_name || ':' || grantee from information_schema.routine_privileges
       where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')) t")
  name=$(basename "$f")
  if [[ "$name" == *access_and_storage* ]]; then
    echo "after $name: access rules applied (grants are intended from here on)"
  elif [ -n "$open" ]; then
    echo "after $name: OPEN -> $open"; fail=1
  else
    echo "after $name: nothing reachable from the website"
  fi
done
psql -qAtc "drop database if exists $db" > /dev/null
exit $fail
