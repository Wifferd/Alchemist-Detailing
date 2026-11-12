-- Test project: 2026-11-12 (version 20261112204610). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 3b, file 2 of 2 (Nov 12, 2026; review round 2): a stamp counts the reminders from the record.
-- Replaces wallet_stamp_do from part 3 (same name, arguments, answer and grants); file 1 of 2 (20261112200001)
-- explains the rule and does the same for wallet_unstamp_do.
--
-- Why: part 3 set reminders_sent to 0 for any stamp on or after the card's last wash day. A wash recorded late for a
-- day before the reminders went out (a second car the same day, stamped weeks later, or a past wash added by hand)
-- restarted the reminders of a card that had gone quiet, with no new wash.
-- Now: reminders_sent = the after-wash reminders whose day on Parker's clock is later than the card's latest live wash
-- (after this stamp). A new wash after the reminders gives 0, so the count starts again as before.
-- Tests: db-tests/m009_tests_wallet.sql, block 5.

create or replace function public.wallet_stamp_do(p_card uuid, p_appointment uuid, p_reason text, p_day date, p_actor uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
  a public.appointments;
  v_slots int;
  v_window int;
  v_today date := public.local_today();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_day date;
  v_other text;
  v_id bigint;
  v_stamps int;
  v_last date;
  v_member boolean;
  v_tz text;
begin
  select s.wallet_slots, s.wallet_stamp_days, s.timezone into v_slots, v_window, v_tz from public.business_settings s where s.id = 1;
  select * into c from public.wallet_cards x where x.id = p_card for update;
  if not found then
    perform public.fail('not_found', 'That card wasn''t found.', 'code');
  end if;
  if c.voided_at is not null then
    perform public.fail('wrong_state', 'Card ' || public.wallet_code_words(c.code) || ' is no longer in use.', 'code');
  end if;
  if v_reason is not null and (char_length(v_reason) > 300 or not public.is_clean_text(v_reason)) then
    perform public.fail('invalid_input', 'Keep the reason under 300 characters, with no links.', 'reason');
  end if;

  if p_appointment is not null then
    a := public.booking_for_update(p_appointment);
    if a.status <> 'completed' then
      perform public.fail('wrong_state', a.ref || ' isn''t completed yet. A wash fills a slot once its job is completed.', 'appointment');
    end if;
    if a.service_date < v_today - v_window then
      perform public.fail('wrong_state', a.ref || ' was on ' || to_char(a.service_date, 'FMMon FMDD, YYYY') || ', more than '
        || v_window || ' days ago, so it can''t fill a slot now. Add it by hand with a reason if it should count.', 'appointment');
    end if;
    if p_day is not null and p_day <> a.service_date then
      perform public.fail('invalid_input', 'A booking fills the slot for its own day.', 'day');
    end if;
    select x.code into v_other
      from public.wallet_stamps st join public.wallet_cards x on x.id = st.card_id
     where st.appointment_id = a.id and st.removed_at is null;
    if found then
      perform public.fail('wrong_state', a.ref || ' already filled a slot on card ' || public.wallet_code_words(v_other) || '.', 'appointment');
    end if;
    v_day := a.service_date;
  else
    if v_reason is null then
      perform public.fail('invalid_input', 'Say why this wash has no booking (for example, a wash before the card existed).', 'reason');
    end if;
    v_day := coalesce(p_day, v_today);
    if v_day > v_today then
      perform public.fail('invalid_input', 'That day is in the future.', 'day');
    end if;
    if v_day < v_today - 1096 then
      perform public.fail('invalid_input', 'That day is more than three years ago.', 'day');
    end if;
    if exists (select 1 from public.wallet_stamps st
                where st.card_id = c.id and st.appointment_id is null and st.removed_at is null and st.day = v_day) then
      perform public.fail('wrong_state', 'Card ' || public.wallet_code_words(c.code) || ' already has a wash without a booking on '
        || to_char(v_day, 'FMMon FMDD, YYYY') || '.', 'day');
    end if;
  end if;

  begin
    insert into public.wallet_stamps (card_id, appointment_id, day, reason, stamped_by)
    values (c.id, a.id, v_day, v_reason, p_actor)
    returning id into v_id;
  exception when unique_violation then
    perform public.fail('wrong_state', 'That wash already filled a slot.');
  end;

  select count(*), max(st.day) into v_stamps, v_last
  from public.wallet_stamps st where st.card_id = c.id and st.removed_at is null;
  v_member := c.member_since is null and v_stamps >= v_slots;
  update public.wallet_cards x
     set stamps = v_stamps,
         last_wash_day = v_last,
         -- recounted from the record: the after-wash reminders sent on a later day than the latest live wash
         reminders_sent = (select count(*)::int from public.wallet_reminders w
                            where w.card_id = c.id and w.kind = 'after_wash'
                              and (w.sent_at at time zone v_tz)::date > v_last),
         reminder_text = null,
         member_since = case when v_member then now() else x.member_since end,
         last_change = case when v_member then 'member' else 'stamp' end,
         last_notice_at = now(),
         changed_at = public.wallet_bump(x.changed_at)
   where x.id = c.id
  returning * into c;
  return jsonb_build_object('stamp_id', v_id, 'code', c.code, 'code_words', public.wallet_code_words(c.code),
    'stamps', c.stamps, 'slots', v_slots, 'count_words', public.wallet_count_words(c.stamps, v_slots),
    'member', c.member_since is not null, 'became_member', v_member, 'day', v_day, 'ref', a.ref);
end
$$;

revoke all on function public.wallet_stamp_do(uuid, uuid, text, date, uuid) from public, anon, authenticated, service_role;
