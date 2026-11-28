-- Migration 013, part 2 (Nov 27, 2026; the owner's "yes for guest past bookings", doc 57 open point 1):
-- a customer account also sees that phone's earlier guest bookings, read only.
--
-- my_bookings is the live definition (Migration 008 part 3, live md5 1cb1eb7e9fc1667854c12822aedd5760) with one
-- addition. The account's own rows are built exactly as before (same keys, same values, same order rule). After them
-- come the guest rows that pass every one of these tests:
--   * the caller is a customer (app_role() = 'customer'): never a detailer, manager or admin, so the owner's own
--     test bookings as a guest stay out of his account, and no staff login reads a customer's guest booking;
--   * the caller's phone is confirmed by a text code (auth.users.phone_confirmed_at, not an anonymous login), and the
--     profile holds that same number (both are set by the sign-in, handle_auth_contact_change);
--   * the booking was made on the guest path (customer_id and created_by both empty; a booking the team entered has
--     created_by set and is not included), with that same normalized phone (submit_guest_booking stores
--     normalize_phone of the typed number);
--   * the owner confirmed it: status confirmed, in progress or completed. Requested, needs information, declined and
--     cancelled stay out, and so does anything in the Spam lane;
--   * it was made in the last 12 months (created_at), and it is not anonymized.
-- A guest's phone is typed, never confirmed, so only bookings the owner confirmed count: he reached that number.
--
-- Nothing is copied or moved: the booking keeps customer_id empty. So everything keyed on the account stays closed for
-- these rows: submit_review (customer_id = auth.uid()), photos (none on a guest booking), saved vehicles, the First
-- Timer Deal history (already by phone), anonymize_customer (the account's own rows only).
--
-- A guest row differs from an own row in four ways only:
--   * it carries "booked_as_guest": true (own rows carry no such key, so they are unchanged byte for byte);
--   * "shop_address" is always null: the owner's address goes out with his own confirmation text, never by this link
--     (house rule 6);
--   * "address" (the street of a "We come to you" booking) is always null; "address_zip" stays. A guest's phone is
--     typed, so a wrong or borrowed number would otherwise show that street to whoever holds the number. The site
--     shows the ZIP instead;
--   * the history keeps status and time, with the note always null (the notes are the team's).
-- If a guest's number turns out to be wrong, the owner cancels that booking: it then leaves that account.
--
-- create or replace keeps the owner and the grants (authenticated only; anon has no execute and assert_signed_in
-- refuses a signed-out caller). md5 of pg_get_functiondef(my_bookings): before 1cb1eb7e9fc1667854c12822aedd5760,
-- after a3482b4aa5794b16256638a57861e008 (Postgres 16 locally, with and without Migration 004; the "before" value matched live, Nov 27).
create or replace function public.my_bookings() returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_phone text;
begin
  perform public.assert_signed_in();
  if public.app_role() = 'customer' then
    select public.normalize_phone(u.phone) into v_phone
    from auth.users u
    join public.profiles pr on pr.id = u.id
    where u.id = auth.uid()
      and u.phone_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and pr.phone is not null
      and pr.phone = public.normalize_phone(u.phone);
  end if;
  return query
    select b.j from (
      select public.booking_receipt(a) || jsonb_build_object(
               'conditions', to_jsonb(coalesce(a.conditions, '{}'::text[])),
               'shop_address', case when a.location_type = 'shop' and a.status in ('confirmed', 'in_progress')
                                         and public.app_role() is distinct from 'manager'
                                    then s.shop_address end,
               'team', case when a.status in ('confirmed', 'in_progress', 'completed') then coalesce((
                          select jsonb_agg(pr.first_name order by x.created_at)
                          from public.appointment_assignments x
                          join public.profiles pr on pr.id = x.employee_id
                          where x.appointment_id = a.id and pr.first_name is not null), '[]'::jsonb)
                        else '[]'::jsonb end,
               'history', coalesce((
                          select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at, 'note', e.note)
                                           order by e.created_at, e.id)
                          from public.appointment_events e
                          where e.appointment_id = a.id and e.from_status is distinct from e.to_status), '[]'::jsonb))
               as j,
             a.service_date, a.start_min
      from public.appointments a
      cross join public.business_settings s
      where s.id = 1
        and a.customer_id = auth.uid()
        and a.anonymized_at is null
      union all
      select public.booking_receipt(g) || jsonb_build_object(
               'address', null,
               'conditions', to_jsonb(coalesce(g.conditions, '{}'::text[])),
               'shop_address', null,
               'team', coalesce((
                          select jsonb_agg(pr.first_name order by x.created_at)
                          from public.appointment_assignments x
                          join public.profiles pr on pr.id = x.employee_id
                          where x.appointment_id = g.id and pr.first_name is not null), '[]'::jsonb),
               'history', coalesce((
                          select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at, 'note', null)
                                           order by e.created_at, e.id)
                          from public.appointment_events e
                          where e.appointment_id = g.id and e.from_status is distinct from e.to_status), '[]'::jsonb),
               'booked_as_guest', true),
             g.service_date, g.start_min
      from public.appointments g
      where v_phone is not null
        and g.customer_id is null
        and g.created_by is null
        and g.contact_phone = v_phone
        and g.status in ('confirmed', 'in_progress', 'completed')
        and g.queue <> 'spam'
        and g.anonymized_at is null
        and g.created_at >= now() - interval '12 months'
    ) b
    order by b.service_date desc, b.start_min desc;
end
$$;
