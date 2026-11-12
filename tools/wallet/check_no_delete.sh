#!/bin/bash
# The Supabase MCP holds any SQL that contains a delete (CLAUDE.md), so Migration 009 and its tests never name one,
# not even in a comment: removals are flags (removed_at, voided_at). Prints any line that does and exits 1; prints
# nothing and exits 0 when the files are clean. Run it before every apply_migration or test run of Migration 009.
cd "$(dirname "$0")/../.." || exit 2
files=(supabase/migrations/*_m009_*.sql db-tests/m009_tests_*.sql)
if grep -inE 'delete|drop|truncate' "${files[@]}"; then
  exit 1
fi
exit 0
