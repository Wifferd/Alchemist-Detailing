-- Test project: 2026-11-12 (version 20261112144737). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 3 of 5 (Nov 12, 2026): stamping a wash card, the "Waiting for a stamp" list, the owner's card
-- screen, and the same from the Supabase SQL Editor (office.stamp, office.unstamp, office.card, office.cards,
-- office.waiting).
--
-- The owner's answers (Nov 11-12): the customer is usually there, so he scans the card's QR with his phone after the wash
-- and Admin opens on the card (wallet_find), one tap (wallet_stamp; "Complete and stamp" completes today's job first).
-- When they're away, Admin keeps a "Waiting for a stamp" list (wallet_waiting): completed bookings with no stamp, each
-- with up to 3 suggested cards (a card already stamped for the same phone or account). Nothing is stamped by itself: he
-- taps to confirm. The SQL Editor path works until staff sign-in has text codes.
-- Rules (the owner's answers and the lead's PROPOSED defaults):
--   - Only the owner (the admin, after his authenticator code) stamps, takes a stamp back (with a reason) or voids a card.
--   - Every completed booking is one slot (two cars = two bookings = two slots); a booking fills one slot at most.
--   - Only a completed booking fills a slot, within wallet_stamp_days (60) of its day. A completed booking can't be
--     cancelled afterwards (cancel_booking refuses it), so a stamp is never stranded.
--   - Past washes by hand: no booking, a reason, and a day (today, or a past day up to three years back); at most one such
--     stamp per card per day.
--   - At wallet_slots (10) the card turns gold ("member"); after 10 it stays gold and keeps counting. A take-back that
--     leaves fewer than 10 turns it back, silently.
--   - Separate from the Gold client ($200+) rule: nothing here reads payments.
-- wallet_stamp_do and wallet_unstamp_do do the work for both paths and are closed to every API role: the SQL Editor has no
-- sign-in, so the role check sits in the API functions (wallet_stamp, wallet_unstamp) only.
-- A holder's pass is updated by part 5 (a trigger on changed_at), which isn't on this project yet.
-- Tests: db-tests/m009_tests_wallet.sql.

-- ---------------------------------------------------------------- the card as Admin sees it (no API role)
create or replace function public.wallet_card_info(p_card uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'code', c.code,
    'code_words', public.wallet_code_words(c.code),
    'stamps', c.stamps,
    'slots', s.wallet_slots,
    'count_words', public.wallet_count_words(c.stamps, s.wallet_slots),
    'member', c.member_since is not null,
    'member_since', c.member_since,
    'last_wash_day', c.last_wash_day,
    'apple_devices', (select count(*) from public.wallet_apple_registrations r where r.card_id = c.id and r.removed_at is null),
    'on_google', c.google_saved,
    'google_link_made', c.google_issued_at is not null,
    'reminders_off', c.reminders_off,
    'last_reminder_at', c.last_reminder_at,
    'voided', c.voided_at is not null,
    'voided_at', c.voided_at,
    'void_reason', c.void_reason,
    'first_added_at', c.first_added_at,
    'created_at', c.created_at)
  from public.wallet_cards c
  cross join (select x.wallet_slots from public.business_settings x where x.id = 1) s
  where c.id = p_card
$$;

-- ---------------------------------------------------------------- the work (no API role)
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
begin
  select s.wallet_slots, s.wallet_stamp_days into v_slots, v_window from public.business_settings s where s.id = 1;
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
         reminders_sent = case when v_day >= coalesce(c.last_wash_day, v_day) then 0 else x.reminders_sent end,
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
  select s.wallet_slots into v_slots from public.business_settings s where s.id = 1;
  select count(*), max(y.day) into v_stamps, v_last
  from public.wallet_stamps y where y.card_id = c.id and y.removed_at is null;
  update public.wallet_cards x
     set stamps = v_stamps,
         last_wash_day = v_last,
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

-- Completed bookings with no live stamp, newest first, each with up to 3 suggested cards: cards (not voided) with a
-- live stamp on another booking of the same phone number or the same account. Only suggestions: the owner confirms.
create or replace function public.wallet_waiting_list(p_days int)
returns table (appointment_id uuid, ref text, service_date date, start_min int, end_min int, first_name text,
               location_type text, suggestions jsonb)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.ref, a.service_date, a.start_min, a.end_min, a.contact_first, a.location_type::text,
    (select coalesce(jsonb_agg(g.j order by g.last_day desc, g.code), '[]'::jsonb)
       from (select jsonb_build_object('code', c.code, 'code_words', public.wallet_code_words(c.code), 'stamps', c.stamps,
                      'slots', s.wallet_slots, 'member', c.member_since is not null, 'last_day', max(st.day)) as j,
                    max(st.day) as last_day, c.code
               from public.wallet_stamps st
               join public.appointments b on b.id = st.appointment_id
               join public.wallet_cards c on c.id = st.card_id
              where st.removed_at is null and c.voided_at is null and b.id <> a.id
                and ((a.contact_phone is not null and b.contact_phone = a.contact_phone)
                  or (a.customer_id is not null and b.customer_id = a.customer_id))
              group by c.id, c.code, c.stamps, c.member_since
              order by max(st.day) desc, c.code
              limit 3) g)
  from public.appointments a
  cross join (select x.wallet_slots, x.wallet_stamp_days from public.business_settings x where x.id = 1) s
  where a.status = 'completed'
    and a.service_date between public.local_today() - least(greatest(coalesce(p_days, 14), 1), s.wallet_stamp_days)
                           and public.local_today()
    and not exists (select 1 from public.wallet_stamps st where st.appointment_id = a.id and st.removed_at is null)
  order by a.service_date desc, a.start_min desc
$$;

revoke all on function public.wallet_card_info(uuid), public.wallet_stamp_do(uuid, uuid, text, date, uuid),
  public.wallet_unstamp_do(bigint, text, uuid), public.wallet_waiting_list(int)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- Admin (the owner, after his authenticator code)
-- The card screen (#admin-cards-<code>): the card, its last 20 stamps, and the bookings it can be stamped for:
-- completed in the last wallet_stamp_days and not stamped, plus today's confirmed or started jobs ("Complete and stamp").
-- "suggested" marks a booking with the same phone or account as one this card was stamped for before.
create or replace function public.wallet_find(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
  v_window int;
  v_today date;
  v_stamps jsonb;
  v_jobs jsonb;
begin
  perform public.assert_admin();
  select * into c from public.wallet_cards x where x.code = public.wallet_norm_code(p_code);
  if not found then
    perform public.fail('not_found', 'No card has the number ' || left(btrim(coalesce(p_code, '')), 20) || '.', 'code');
  end if;
  select s.wallet_stamp_days into v_window from public.business_settings s where s.id = 1;
  v_today := public.local_today();

  select coalesce(jsonb_agg(q.j order by q.created_at desc, q.id desc), '[]'::jsonb) into v_stamps
  from (select st.id, st.created_at,
               jsonb_build_object('id', st.id, 'day', st.day, 'ref', a.ref, 'reason', st.reason,
                 'by', case when st.stamped_by is null then 'SQL Editor' else coalesce(pr.first_name, 'Team') end,
                 'at', st.created_at, 'taken_back', st.removed_at is not null, 'taken_back_at', st.removed_at,
                 'taken_back_reason', st.resolution) as j
          from public.wallet_stamps st
          left join public.appointments a on a.id = st.appointment_id
          left join public.profiles pr on pr.id = st.stamped_by
         where st.card_id = c.id
         order by st.created_at desc, st.id desc
         limit 20) q;

  with mine as (
    select b.contact_phone, b.customer_id
      from public.wallet_stamps st join public.appointments b on b.id = st.appointment_id
     where st.card_id = c.id and st.removed_at is null)
  select coalesce(jsonb_agg(q.j order by q.sugg desc, q.d desc, q.m desc), '[]'::jsonb) into v_jobs
  from (select jsonb_build_object('id', a.id, 'ref', a.ref, 'day', a.service_date, 'start_min', a.start_min,
                 'end_min', a.end_min, 'status', a.status, 'location', a.location_type,
                 'name', concat_ws(' ', a.contact_first, left(a.contact_last, 1) || '.'),
                 'suggested', x.s,
                 'action', case when a.status = 'completed' then 'stamp' else 'complete_and_stamp' end) as j,
               x.s as sugg, a.service_date as d, a.start_min as m
          from public.appointments a
          cross join lateral (select exists (select 1 from mine
                                where (a.contact_phone is not null and mine.contact_phone = a.contact_phone)
                                   or (a.customer_id is not null and mine.customer_id = a.customer_id)) as s) x
         where ((a.status = 'completed' and a.service_date between v_today - v_window and v_today)
             or (a.status in ('confirmed', 'in_progress') and a.service_date = v_today))
           and not exists (select 1 from public.wallet_stamps st where st.appointment_id = a.id and st.removed_at is null)
         order by x.s desc, a.service_date desc, a.start_min desc
         limit 40) q;

  return jsonb_build_object('card', public.wallet_card_info(c.id), 'stamps', v_stamps, 'to_stamp', v_jobs);
end
$$;

-- One tap. With a booking: the booking must be completed (p_complete completes today's confirmed or started job first,
-- with complete_booking's own checks, in the same transaction). Without one: a reason, and p_day for a past wash.
create or replace function public.wallet_stamp(p_code text, p_appointment uuid default null, p_reason text default null,
                                               p_day date default null, p_complete boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_card uuid;
  v_voided timestamptz;
  v_status public.appointment_status;
begin
  perform public.assert_admin();
  select x.id, x.voided_at into v_card, v_voided from public.wallet_cards x where x.code = public.wallet_norm_code(p_code);
  if not found then
    perform public.fail('not_found', 'No card has the number ' || left(btrim(coalesce(p_code, '')), 20) || '.', 'code');
  end if;
  if v_voided is not null then
    perform public.fail('wrong_state', 'Card ' || public.wallet_code_words(public.wallet_norm_code(p_code)) || ' is no longer in use.', 'code');
  end if;
  if coalesce(p_complete, false) then
    if p_appointment is null then
      perform public.fail('invalid_input', 'Pick the job to complete and stamp.', 'appointment');
    end if;
    select a.status into v_status from public.appointments a where a.id = p_appointment;
    if v_status in ('confirmed', 'in_progress') then
      perform public.complete_booking(p_appointment);
    end if;
  end if;
  return public.wallet_stamp_do(v_card, p_appointment, p_reason, p_day, auth.uid());
end
$$;

-- Take a stamp back: the owner only, with a reason (kept in wallet_stamps.resolution, hidden from the audit log).
create or replace function public.wallet_unstamp(p_stamp bigint, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return public.wallet_unstamp_do(p_stamp, p_reason, auth.uid());
end
$$;

-- "Waiting for a stamp": completed bookings of the last p_days (at most wallet_stamp_days) with no stamp.
create or replace function public.wallet_waiting(p_days int default 14) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', w.appointment_id, 'ref', w.ref, 'day', w.service_date,
            'start_min', w.start_min, 'end_min', w.end_min, 'first_name', w.first_name, 'location', w.location_type,
            'suggestions', w.suggestions) order by w.service_date desc, w.start_min desc), '[]'::jsonb)
          from public.wallet_waiting_list(p_days) w);
end
$$;

-- Recent cards, the page's card limits ("Card limit reached"), open sync problems, and the Apple settings' state.
-- cards_this_hour and cards_today are the caps' rolling windows (the last hour, the last 24 hours).
create or replace function public.wallet_list(p_limit int default 50) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hour int;
  v_day int;
  st record;
begin
  perform public.assert_admin();
  select s.wallet_cards_per_hour, s.wallet_cards_per_day, s.wallet_apple_on, s.wallet_google_on, s.wallet_reminders_on,
         s.wallet_apple_cert_expires, (s.wallet_issuer_address is not null and s.wallet_issuer_email is not null) as apple_ready
    into st
  from public.business_settings s where s.id = 1;
  select count(*) filter (where x.created_at > now() - interval '1 hour'), count(*) into v_hour, v_day
  from public.wallet_cards x where x.source = 'page' and x.created_at > now() - interval '24 hours';
  return jsonb_build_object(
    'cards', (select coalesce(jsonb_agg(public.wallet_card_info(q.id) order by q.created_at desc), '[]'::jsonb)
                from (select x.id, x.created_at from public.wallet_cards x order by x.created_at desc
                       limit least(greatest(coalesce(p_limit, 50), 1), 500)) q),
    'cards_this_hour', v_hour, 'cards_today', v_day,
    'hour_cap', st.wallet_cards_per_hour, 'day_cap', st.wallet_cards_per_day,
    'cap_reached', v_hour >= st.wallet_cards_per_hour or v_day >= st.wallet_cards_per_day,
    'problems', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'at', q.at, 'platform', q.platform, 'code', q.code,
                                   'detail', q.detail) order by q.at desc), '[]'::jsonb)
                   from (select * from public.wallet_sync_problems p where p.resolved_at is null order by p.at desc limit 20) q),
    'apple_on', st.wallet_apple_on, 'google_on', st.wallet_google_on, 'apple_ready', st.apple_ready,
    'apple_cert_expires', st.wallet_apple_cert_expires, 'reminders_on', st.wallet_reminders_on);
end
$$;

-- A lost or duplicate card (PROPOSED): voided cards take no stamps, no download links and no reminders; a holder's
-- pass shows it as voided once part 5 syncs it.
create or replace function public.wallet_void(p_code text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();
  select * into c from public.wallet_cards x where x.code = public.wallet_norm_code(p_code) for update;
  if not found then
    perform public.fail('not_found', 'No card has the number ' || left(btrim(coalesce(p_code, '')), 20) || '.', 'code');
  end if;
  if c.voided_at is not null then
    perform public.fail('wrong_state', 'Card ' || public.wallet_code_words(c.code) || ' is already voided.', 'code');
  end if;
  if v_reason is null or char_length(v_reason) > 300 or not public.is_clean_text(v_reason) then
    perform public.fail('invalid_input', 'Say why the card is voided, in under 300 characters, with no links.', 'reason');
  end if;
  update public.wallet_cards x
     set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, last_change = 'void',
         changed_at = public.wallet_bump(x.changed_at)
   where x.id = c.id;
  return public.wallet_card_info(c.id);
end
$$;

revoke all on function public.wallet_find(text), public.wallet_stamp(text, uuid, text, date, boolean),
  public.wallet_unstamp(bigint, text), public.wallet_waiting(int), public.wallet_list(int), public.wallet_void(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.wallet_find(text), public.wallet_stamp(text, uuid, text, date, boolean),
  public.wallet_unstamp(bigint, text), public.wallet_waiting(int), public.wallet_list(int), public.wallet_void(text, text)
  to authenticated;

-- ---------------------------------------------------------------- the SQL Editor (the office schema, not served by the API)
create or replace view office.cards as
select public.wallet_code_words(c.code) as "Card",
  public.wallet_count_words(c.stamps, s.wallet_slots) as "Washes",
  case when c.member_since is not null
       then 'Loyalty member since ' || to_char(c.member_since at time zone s.timezone, 'FMMon FMDD, YYYY') else '' end as "Member",
  coalesce(to_char(c.last_wash_day, 'FMMon FMDD, YYYY'), 'None yet') as "Last wash",
  (select count(*) from public.wallet_apple_registrations r where r.card_id = c.id and r.removed_at is null) as "iPhones",
  case when c.google_saved then 'Saved' when c.google_issued_at is not null then 'Link made, not saved yet' else 'No' end as "Google",
  case when c.reminders_off then 'Off (turned off on the card page)' else 'On' end as "Holder's reminders",
  case when c.voided_at is not null then 'Voided ' || to_char(c.voided_at at time zone s.timezone, 'FMMon FMDD, YYYY') else 'In use' end as "Status",
  to_char(c.created_at at time zone s.timezone, 'FMMon FMDD, YYYY') as "Made",
  c.code as "Code",
  c.created_at as "Made at"
from public.wallet_cards c
cross join (select x.wallet_slots, x.timezone from public.business_settings x where x.id = 1) s
order by c.created_at desc;
comment on view office.cards is 'Every wash card, newest first, in plain words (Migration 009).';

create or replace view office.waiting as
select w.ref as "Reference",
  to_char(w.service_date, 'FMDy FMMon FMDD') as "Day",
  to_char(time '00:00' + make_interval(mins => w.start_min), 'FMHH12:MI AM') as "Time",
  w.first_name as "Name",
  case when w.location_type = 'shop' then 'At the shop' else 'Mobile' end as "Where",
  coalesce((select string_agg((e ->> 'code_words') || ' (' || public.wallet_count_words((e ->> 'stamps')::int, (e ->> 'slots')::int)
                              || '), last stamped for the same customer on ' || to_char((e ->> 'last_day')::date, 'FMMon FMDD'),
                              '; ' order by t.n)
              from jsonb_array_elements(w.suggestions) with ordinality as t(e, n)),
           'None: stamp it at their next visit, or ask for their card number') as "Suggested cards",
  case when jsonb_array_length(w.suggestions) > 0
       then 'select office.stamp(''' || (w.suggestions -> 0 ->> 'code') || ''', ''' || w.ref || ''');' end as "To stamp the first suggestion"
from public.wallet_waiting_list(14) w;
comment on view office.waiting is '"Waiting for a stamp": completed bookings of the last 14 days with no stamp, and suggested cards (Migration 009).';

-- select office.stamp('K7Q2M9XD', 'AD-AB12CD34');  or, for a past wash with no booking:
-- select office.stamp('K7Q2M9XD', null, 'Wash before the card existed', '2026-10-05');
create or replace function office.stamp(p_code text, p_ref text default null, p_reason text default null, p_day date default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
  a public.appointments;
  r jsonb;
  v_msg text;
begin
  select * into c from public.wallet_cards x where x.code = public.wallet_norm_code(p_code);
  if not found then return 'No card has the number ' || coalesce(btrim(p_code), '') || '.'; end if;
  if nullif(btrim(coalesce(p_ref, '')), '') is not null then
    select * into a from public.appointments x where x.ref = upper(btrim(p_ref));
    if not found then return 'No booking has the reference ' || btrim(p_ref) || '.'; end if;
    if a.status in ('confirmed', 'in_progress') then
      return 'Complete ' || a.ref || ' on the Admin page first, then stamp it.';
    end if;
  end if;
  begin
    r := public.wallet_stamp_do(c.id, a.id, p_reason, p_day, null);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = pg_exception_detail;
    return v_msg;
  end;
  return 'Card ' || (r ->> 'code_words') || ': ' || (r ->> 'count_words') || ' ('
    || coalesce(r ->> 'ref', 'no booking') || ', ' || to_char((r ->> 'day')::date, 'FMMon FMDD') || ').'
    || case when (r ->> 'became_member')::boolean then ' The card is gold now: Loyalty member.' else '' end;
end
$$;

-- select office.unstamp('K7Q2M9XD', 'Tapped the wrong card');  takes back the card's latest stamp.
create or replace function office.unstamp(p_code text, p_reason text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
  v_id bigint;
  r jsonb;
  v_msg text;
begin
  select * into c from public.wallet_cards x where x.code = public.wallet_norm_code(p_code);
  if not found then return 'No card has the number ' || coalesce(btrim(p_code), '') || '.'; end if;
  select st.id into v_id from public.wallet_stamps st
   where st.card_id = c.id and st.removed_at is null order by st.created_at desc, st.id desc limit 1;
  if not found then return 'Card ' || public.wallet_code_words(c.code) || ' has no stamp to take back.'; end if;
  begin
    r := public.wallet_unstamp_do(v_id, p_reason, null);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = pg_exception_detail;
    return v_msg;
  end;
  return 'Took back the stamp of ' || to_char((r ->> 'day')::date, 'FMMon FMDD') || ' (' || coalesce(r ->> 'ref', 'no booking')
    || ') from card ' || (r ->> 'code_words') || ': ' || (r ->> 'count_words') || ' now.';
end
$$;

-- select office.card('K7Q2M9XD');  a summary, with the holder's own card page to pass on.
create or replace function office.card(p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c public.wallet_cards;
  v_token text;
  v_slots int;
  v_site text;
  v_tz text;
  v_apple int;
begin
  select * into c from public.wallet_cards x where x.code = public.wallet_norm_code(p_code);
  if not found then return 'No card has the number ' || coalesce(btrim(p_code), '') || '.'; end if;
  select k.add_token into v_token from public.wallet_card_secrets k where k.card_id = c.id;
  select s.wallet_slots, s.wallet_site_url, s.timezone into v_slots, v_site, v_tz from public.business_settings s where s.id = 1;
  select count(*) into v_apple from public.wallet_apple_registrations r where r.card_id = c.id and r.removed_at is null;
  return 'Card ' || public.wallet_code_words(c.code) || ': ' || public.wallet_count_words(c.stamps, v_slots)
    || case when c.member_since is not null
            then ', loyalty member since ' || to_char(c.member_since at time zone v_tz, 'FMMon FMDD, YYYY') else '' end
    || '. Last wash: ' || coalesce(to_char(c.last_wash_day, 'FMMon FMDD, YYYY'), 'none yet')
    || '. iPhones: ' || v_apple
    || '. Google: ' || case when c.google_saved then 'saved' else 'not saved' end
    || '. Holder''s reminders: ' || case when c.reminders_off then 'off' else 'on' end
    || case when c.voided_at is not null then '. VOIDED: ' || c.void_reason else '' end
    || '. Their card page: ' || coalesce(v_site, '(your website)') || '/#card-' || v_token;
end
$$;

revoke all on office.cards, office.waiting from public, anon, authenticated, service_role;
revoke all on function office.stamp(text, text, text, date), office.unstamp(text, text), office.card(text)
  from public, anon, authenticated, service_role;
