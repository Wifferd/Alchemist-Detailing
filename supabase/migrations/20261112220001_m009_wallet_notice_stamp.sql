-- Test project: 2026-11-12 (version 20261112210532). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 5c, file 1 of 3 (Nov 12, 2026; review round 2): notices are capped. A stamp or the gold change
-- shows a notice on the holder's phone only when the rule below allows it, and the card records the decision.
--
-- Why: every stamp notified on both wallets. Four past washes added by hand in one sitting gave four "Wash stamped"
-- notices about old washes on an iPhone, and on Android the fourth notifying update in 24 hours is refused by Google
-- (QuotaExceededException), which left the card behind and had the sweep send the same refused update every 10
-- minutes. Plan 4.4 (notify only when Google's 3-in-24-hours cap allows) and 6.2 (at most one notifying change a day
-- per card on our side; a stamp notice and a reminder never on the same day).
-- What:
--   - wallet_cards.notify_change: whether the card's latest stamp or gold change shows a notice, decided when the
--     change is made (file 2 and 3: the pass and the Google update read it);
--   - wallet_stamp_do (part 3b's, same name, arguments and grants; its answer adds "notice") decides it and moves
--     last_notice_at only when a notice goes out.
-- Tests: db-tests/m009_tests_notices.sql (and m009_tests_wallet.sql, m009_tests_sync.sql still pass).

alter table public.wallet_cards add column notify_change boolean not null default false;
comment on column public.wallet_cards.notify_change is
  'Whether the latest stamp or gold change shows a notice (wallet_stamp_do decides: not for a past day added by hand unless it turns the card gold, at most one notice a day per card on Parker''s clock, not when the holder silenced everything). Read only while last_change is stamp or member.';
comment on column public.wallet_cards.last_notice_at is
  'The latest change that showed the holder a notice (a stamp or gold change that notified, or a reminder). Silent changes leave it.';

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
  v_mute boolean;
  v_notify boolean;
begin
  select s.wallet_slots, s.wallet_stamp_days, s.timezone, s.wallet_quiet_mutes_stamps
    into v_slots, v_window, v_tz, v_mute from public.business_settings s where s.id = 1;
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
  -- Whether this change shows a notice on the holder's phone (review round 2). c is the card as it was before this stamp.
  --   - Never for a past day added by hand: old washes entered in one sitting would each notify (four "Wash stamped"
  --     notices about old washes). The one exception is the stamp that turns the card gold: one "Loyalty member".
  --     A booking's stamp notifies whatever its day (a wash from the waiting list, stamped at the next visit).
  --   - At most one notice a day per card on Parker's clock, reminders included (plan 6.2: a stamp notice and a reminder
  --     never on the same day; wallet_due_list holds a reminder back on a day with a notice). One a day per card also
  --     keeps every card under Google's 3 notifying updates in 24 hours: a 24-hour stretch meets at most two of Parker's
  --     days, three across the 23-hour day when the clocks go forward, never four.
  --   - Not when the holder turned reminders off and the owner chose to silence everything (wallet_quiet_mutes_stamps;
  --     wallet_pass_data and wallet_sync_card check that again when they build the pass).
  -- last_notice_at moves only when a notice goes out, so a silent change never holds a reminder back.
  v_notify := (p_appointment is not null or v_day >= v_today or v_member)
              and (c.last_notice_at is null or (c.last_notice_at at time zone v_tz)::date < v_today)
              and not (c.reminders_off and coalesce(v_mute, false));
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
         last_notice_at = case when v_notify then now() else x.last_notice_at end,
         notify_change = v_notify,
         changed_at = public.wallet_bump(x.changed_at)
   where x.id = c.id
  returning * into c;
  return jsonb_build_object('stamp_id', v_id, 'code', c.code, 'code_words', public.wallet_code_words(c.code),
    'stamps', c.stamps, 'slots', v_slots, 'count_words', public.wallet_count_words(c.stamps, v_slots),
    'member', c.member_since is not null, 'became_member', v_member, 'day', v_day, 'ref', a.ref,
    'notice', v_notify);
end
$$;

revoke all on function public.wallet_stamp_do(uuid, uuid, text, date, uuid) from public, anon, authenticated, service_role;
