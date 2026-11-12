-- Test project: 2026-11-12 (version 20261112210547). Live: not applied (needs the owner's OK, Phase D of the plan).
-- Migration 009, part 5c, file 2 of 3 (Nov 12, 2026; review round 2): the pass shows a notice only when the change was
-- allowed one. Replaces wallet_pass_data from part 4 (same name, arguments, answer and grants): "notify" for a stamp or
-- gold change now also needs wallet_cards.notify_change (file 1 decides it), so a past wash added by hand, or a second
-- stamp the same day, updates an iPhone's card without a change message. File 1 explains the rule.
-- Tests: db-tests/m009_tests_notices.sql.

create or replace function public.wallet_pass_data(p_dl text default null, p_code text default null, p_auth text default null,
                                                   p_platform text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  k public.wallet_card_secrets;
  c public.wallet_cards;
  st record;
  v_platform text;
  v_dl text := upper(btrim(coalesce(p_dl, '')));
  v_code text := public.wallet_norm_code(p_code);
  v_auth text := btrim(coalesce(p_auth, ''));
begin
  select s.wallet_apple_on, s.wallet_google_on, s.wallet_slots, s.wallet_card_name, s.public_phone, s.public_area,
         s.wallet_issuer_address, s.wallet_issuer_email, s.wallet_site_url, s.wallet_quiet_mutes_stamps
    into st
  from public.business_settings s where s.id = 1;
  if v_dl <> '' then
    if v_dl !~ '^[A-HJ-NP-Z2-9]{26}$' then return null; end if;
    select * into k from public.wallet_card_secrets x where x.dl_token = v_dl and x.dl_expires_at > now();
    if not found then return null; end if;
    v_platform := k.dl_platform;
    select * into c from public.wallet_cards x where x.id = k.card_id;
    if c.voided_at is not null then return null; end if;
  elsif v_code is not null then
    if v_auth !~ '^[A-HJ-NP-Z2-9]{32}$' then return null; end if;
    select * into c from public.wallet_cards x where x.code = v_code;
    if not found then return null; end if;
    select * into k from public.wallet_card_secrets x where x.card_id = c.id;
    if k.apple_token is distinct from v_auth then return null; end if;
    v_platform := 'apple';
  else
    return null;
  end if;
  if p_platform is not null and p_platform is distinct from v_platform then return null; end if;
  if (v_platform = 'apple' and not st.wallet_apple_on) or (v_platform = 'google' and not st.wallet_google_on) then
    return null;
  end if;
  return jsonb_build_object(
    'card_id', c.id,
    'code', c.code,
    'code_words', public.wallet_code_words(c.code),
    'platform', v_platform,
    'card_name', st.wallet_card_name,
    'stamps', c.stamps,
    'slots', st.wallet_slots,
    'count_words', public.wallet_count_words(c.stamps, st.wallet_slots),
    'member', c.member_since is not null,
    'member_since', c.member_since,
    'last_wash_day', c.last_wash_day,
    'last_change', c.last_change,
    -- whether this change shows a notice: a stamp or gold change when wallet_stamp_do allowed one (part 5c: not a past
    -- day added by hand, one a day per card) and the holder didn't silence everything (Q-6c setting); a reminder's text
    'notify', case when c.last_change in ('stamp', 'member')
                     then c.notify_change and not (c.reminders_off and st.wallet_quiet_mutes_stamps)
                   when c.last_change = 'reminder' then c.reminder_text is not null
                   else false end,
    'reminder_text', c.reminder_text,
    'voided', c.voided_at is not null,
    'changed_at', c.changed_at,
    'changed_at_ms', (extract(epoch from c.changed_at) * 1000)::bigint,
    'add_token', k.add_token,
    'apple_token', k.apple_token,
    'google_object_id', c.google_object_id,
    'google_saved', c.google_saved,
    'issuer', jsonb_build_object('area', st.public_area, 'phone', st.public_phone,
                                 'address', st.wallet_issuer_address, 'email', st.wallet_issuer_email),
    'site_url', st.wallet_site_url);
end
$$;
