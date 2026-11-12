-- Test project: 2026-11-12 (version 20261112181345). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 4b (Nov 12, 2026; review round 1): Apple's "which passes changed?" call gets an update tag that
-- always moves forward. Replaces wallet_apple_changed from part 4 (same name, arguments, answer and grants).
--
-- Why: part 4 subtracted a 10-second overlap from the device's tag and answered with the newest changed_at of the cards
-- it listed. A phone that asked again with that tag got the same card(s) and the same tag back, every time, and never
-- the 204 the plan asks for (plan 3.4, test 3.6 #8); iOS treats a list whose tag didn't move as a web-service error.
--
-- Now:
--   - a card is listed when its changed_at is after the device's tag (no subtraction);
--   - nothing after the tag: null, so the Edge Function answers 204;
--   - the new tag is the clock 10 seconds back, in epoch milliseconds, and always at least one millisecond past the
--     device's tag, so tags only move forward [A12] and a list never comes with the tag it was asked with;
--   - a change committed up to 10 seconds after its changed_at (a late commit) is newer than the tag handed out while it
--     was still open, so the next ask lists it; a card changed in the 10 seconds before an ask is listed once more on
--     the next ask (the pass route then answers 304 or the same pass).
-- changed_at comes from wallet_bump (the clock at the change, whole milliseconds, at least a second past the last one).
-- Tests: db-tests/m009_tests_wallet.sql, block 4.

create or replace function public.wallet_apple_changed(p_device text, p_since text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_since_ms bigint;
  v_since timestamptz;
  v_codes jsonb;
  v_tag bigint;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9._-]{1,128}$' then return null; end if;
  update public.wallet_apple_devices d set last_seen_at = now() where d.device_id = p_device;
  if not found then return null; end if;
  if btrim(coalesce(p_since, '')) ~ '^[0-9]{1,15}$' then
    v_since_ms := btrim(p_since)::bigint;
    v_since := timestamptz 'epoch' + v_since_ms * interval '1 millisecond';
  end if;
  select jsonb_agg(c.code order by c.code) into v_codes
  from public.wallet_apple_registrations x
  join public.wallet_cards c on c.id = x.card_id
  where x.device_id = p_device and x.removed_at is null and (v_since is null or c.changed_at > v_since);
  if v_codes is null then return null; end if;
  -- greatest() skips the null when the device sent no tag
  v_tag := greatest(v_since_ms + 1, floor(extract(epoch from clock_timestamp() - interval '10 seconds') * 1000)::bigint);
  return jsonb_build_object('serialNumbers', v_codes, 'lastUpdated', v_tag::text);
end
$$;

revoke all on function public.wallet_apple_changed(text, text) from public, anon, authenticated, service_role;
grant execute on function public.wallet_apple_changed(text, text) to service_role;
