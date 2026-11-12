-- Test project: 2026-11-12 (version 20261112204551). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 3b, file 1 of 2 (Nov 12, 2026; review round 2): taking a stamp back no longer restarts the
-- reminders. Replaces wallet_unstamp_do from part 3 (same name, arguments, answer and grants); file 2 of 2
-- (20261112200002) does the same for wallet_stamp_do. Part 3's file is unchanged.
--
-- The owner's rule (Nov 11-12): one reminder 4 weeks after the last wash, at most one more 4 weeks later, then quiet
-- until the next wash.
-- Why: a stamp set reminders_sent to 0 and a take-back recounted the stamps and the last wash day but kept that 0. So
-- when the owner stamped the wrong card and took the stamp back, a card that had gone quiet (two reminders sent) became
-- due again and got up to two more reminders with no new wash (review round 2, probed on the test project).
-- Now: reminders_sent is recounted from what was sent (wallet_reminders): the after-wash reminders whose day on
-- Parker's clock is later than the card's latest live wash; 0 when no stamp is left. The take-back puts back the
-- count the card had before the wrong stamp; a later reminder that went out while the wrong stamp stood counts too.
-- A reminder sent on the wash's own day belongs to the wash before it: the first reminder comes
-- wallet_reminder_first_days (at least 7) after a wash and the next wallet_reminder_again_days (at least 7) after that,
-- so no reminder follows a wash on the same day.
-- Tests: db-tests/m009_tests_wallet.sql, block 5.

create or replace function public.wallet_unstamp_do(p_stamp bigint, p_reason text, p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_card uuid;
  c public.wallet_cards;
  st public.wallet_stamps;
  v_slots int;
  v_stamps int;
  v_last date;
  v_tz text;
begin
  select x.card_id into v_card from public.wallet_stamps x where x.id = p_stamp;
  if not found then
    perform public.fail('not_found', 'That stamp wasn''t found.', 'stamp');
  end if;
  select * into c from public.wallet_cards x where x.id = v_card for update;
  select * into st from public.wallet_stamps x where x.id = p_stamp for update;
  if st.removed_at is not null then
    perform public.fail('wrong_state', 'That stamp was already taken back.', 'stamp');
  end if;
  if v_reason is null then
    perform public.fail('invalid_input', 'Say why the stamp is taken back.', 'reason');
  end if;
  if char_length(v_reason) > 300 or not public.is_clean_text(v_reason) then
    perform public.fail('invalid_input', 'Keep the reason under 300 characters, with no links.', 'reason');
  end if;
  update public.wallet_stamps x set removed_at = now(), removed_by = p_actor, resolution = v_reason where x.id = st.id;
  select s.wallet_slots, s.timezone into v_slots, v_tz from public.business_settings s where s.id = 1;
  select count(*), max(y.day) into v_stamps, v_last
  from public.wallet_stamps y where y.card_id = c.id and y.removed_at is null;
  update public.wallet_cards x
     set stamps = v_stamps,
         last_wash_day = v_last,
         -- recounted from the record: the after-wash reminders sent on a later day than the latest live wash
         reminders_sent = (select count(*)::int from public.wallet_reminders w
                            where w.card_id = c.id and w.kind = 'after_wash' and v_last is not null
                              and (w.sent_at at time zone v_tz)::date > v_last),
         member_since = case when v_stamps < v_slots then null else x.member_since end,
         last_change = 'unstamp',
         changed_at = public.wallet_bump(x.changed_at)
   where x.id = c.id
  returning * into c;
  return jsonb_build_object('stamp_id', st.id, 'day', st.day, 'code', c.code, 'code_words', public.wallet_code_words(c.code),
    'stamps', c.stamps, 'slots', v_slots, 'count_words', public.wallet_count_words(c.stamps, v_slots),
    'member', c.member_since is not null,
    'ref', (select a.ref from public.appointments a where a.id = st.appointment_id));
end
$$;

revoke all on function public.wallet_unstamp_do(bigint, text, uuid) from public, anon, authenticated, service_role;
