-- Migration 010: a phone alert to the owner the moment a booking request comes in.
--
-- Why: the owner, Nov 12 (doc 53): "tell me immediatly if someone booked us". Until now nothing alerted him; he saw a
-- request only by opening Admin. Texts wait for Twilio; he chose an instant push through ntfy (ntfy.sh, a free
-- notification app) over an hourly check.
--
-- What the push carries: the reference, the day and start time (Parker's clock), the services and "Mobile" or
-- "Come to us". Never the customer's name, phone, email, address, car, notes or photos: the push passes through ntfy's
-- servers. Tapping it opens Admin's Requests.
--
-- How:
-- - The ntfy topic is a secret kept in Supabase Vault under the name 'booking_alert_ntfy_topic', never in this file
--   or the repository. No topic in Vault (or one that isn't a plain token): no alert, and nothing else changes.
-- - A deferred constraint trigger runs at commit, so the booking's services are in place, and a booking that is
--   rolled back sends nothing. pg_net queues the request inside the same transaction and sends it after commit.
-- - Any failure in here is caught and only logged as a warning: an alert must never stop a booking.
--
-- Test project: 2026-11-12. Live: 2026-11-12 (the owner's request above).

create extension if not exists pg_net;

create or replace function public.booking_alert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_topic text;
  v_services text;
  v_msg text;
begin
  begin
    select s.decrypted_secret into v_topic
      from vault.decrypted_secrets s
     where s.name = 'booking_alert_ntfy_topic'
     limit 1;
    if v_topic is null or v_topic !~ '^[A-Za-z0-9_-]{16,64}$' then
      return null;
    end if;

    -- the services as booked (bundle, exterior, interior, add-ons), not the parts a bundle includes or condition fees
    select string_agg(i.name, ', ' order by i.sort, i.name) into v_services
      from public.appointment_items i
     where i.appointment_id = new.id
       and not i.included
       and i.code not like 'cond\_%';

    v_msg := new.ref
      || ' · ' || to_char(new.service_date, 'Dy, Mon FMDD')
      || ' at ' || to_char(make_time(new.start_min / 60, new.start_min % 60, 0), 'FMHH12:MI AM')
      || coalesce(' · ' || nullif(v_services, ''), '')
      || ' · ' || case when new.location_type::text = 'mobile' then 'Mobile' else 'Come to us' end;

    perform net.http_post(
      url := 'https://ntfy.sh',
      body := jsonb_build_object(
        'topic', v_topic,
        'title', 'New booking request',
        'message', v_msg,
        'tags', jsonb_build_array('car'),
        'priority', 4,
        'click', 'https://thealchemistdetailing.com/#admin-requests'),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000);
  exception when others then
    raise warning 'booking_alert skipped for %: %', new.ref, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.booking_alert() from public, anon, authenticated;

create constraint trigger appointments_booking_alert
  after insert on public.appointments
  deferrable initially deferred
  for each row execute function public.booking_alert();
