-- Test project: 2026-11-12 (version 20261112210556). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 5c, file 3 of 3 (Nov 12, 2026; review round 2): the sync sends a notifying update only when the
-- change was allowed one. Replaces wallet_sync_card from part 5b (same name, argument, answer and grants): "notify"
-- for a stamp or gold change now also needs wallet_cards.notify_change (file 1 decides it), so Google gets
-- notifyPreference: NOTIFY_ON_UPDATE at most once a day per card and never for a past wash added by hand.
-- Tests: db-tests/m009_tests_notices.sql.

create or replace function public.wallet_sync_card(p_card uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'card_id', c.id,
    'code', c.code,
    'code_words', public.wallet_code_words(c.code),
    'card_name', s.wallet_card_name,
    'stamps', c.stamps,
    'slots', s.wallet_slots,
    'count_words', public.wallet_count_words(c.stamps, s.wallet_slots),
    'member', c.member_since is not null,
    'member_since', c.member_since,
    'last_wash_day', c.last_wash_day,
    'last_change', c.last_change,
    -- a stamp or gold change notifies only when wallet_stamp_do allowed it (part 5c file 1); Google then gets
    -- notifyPreference only on such a change (wallet-sync, google.ts objectPatch)
    'notify', case when c.last_change in ('stamp', 'member')
                     then c.notify_change and not (c.reminders_off and s.wallet_quiet_mutes_stamps)
                   when c.last_change = 'reminder' then c.reminder_text is not null
                   else false end,
    'reminder_text', c.reminder_text,
    'voided', c.voided_at is not null,
    'changed_at', c.changed_at,
    'changed_at_ms', (extract(epoch from c.changed_at) * 1000)::bigint,
    'google_object_id', c.google_object_id,
    'google_saved', c.google_saved,
    'issuer', jsonb_build_object('area', s.public_area, 'phone', s.public_phone,
                                 'address', s.wallet_issuer_address, 'email', s.wallet_issuer_email),
    'site_url', s.wallet_site_url,
    'apple_on', s.wallet_apple_on,
    'google_on', s.wallet_google_on,
    'apple_pending', c.apple_synced_at is distinct from c.changed_at,
    'google_pending', c.google_synced_at is distinct from c.changed_at)
  from public.wallet_cards c
  cross join (select x.wallet_card_name, x.wallet_slots, x.wallet_quiet_mutes_stamps, x.public_area, x.public_phone,
                     x.wallet_issuer_address, x.wallet_issuer_email, x.wallet_site_url, x.wallet_apple_on,
                     x.wallet_google_on
                from public.business_settings x where x.id = 1) s
  where c.id = p_card
$$;
