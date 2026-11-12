-- Test project: 2026-11-12 (version 20261112152940). Live: not applied (switching these on needs the owner's OK, Phase D).
-- Migration 009, part 5a of 5 (Nov 12, 2026): the two extensions the wallet card's update call needs.
--
-- What: pg_net (the database queues an HTTP call that a background worker sends after the transaction commits) and
-- pg_cron (the schedules: the 10-minute sweep, the daily reminders run, the weekly push-code tidy). Supabase Vault
-- (supabase_vault) is already on every project; checked read-only with the MCP list_extensions first.
-- Why: plan 3.5. Part 5b (20261112120006) uses them; without them part 5b does nothing and parts 1-4 work as before.
-- Owner decisions: build our own (Nov 11-12); nothing touches live without his OK.
-- Tests: db-tests/m009_tests_sync.sql.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
