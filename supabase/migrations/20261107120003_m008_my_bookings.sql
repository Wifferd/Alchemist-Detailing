-- Applied to the test project only, on Nov 7, 2026 (version 20261107034637). For live: with part 2 or right after it.
-- Migration 008, part 3 (Nov 7, 2026; the owner's answers 3 and 5 to doc 45, "Yes to all"):
-- my_bookings is the live definition (Migration 001) with two changes.
-- 1. No address for a manager. Part 2 closed the address column, but a manager (their phone is confirmed by the
--    sign-in code) could book a "Come to us" job for themselves, confirm it and read the owner's address here.
--    Now a manager's own bookings never carry it; customers, detailers and the admin are unchanged (house rule 6).
--    app_role() is the role itself, so this holds with or without the authenticator.
-- 2. Each booking carries its conditions, so the Appointments page says "we confirm the price" for a request with
--    "Other" until the owner confirms it (answer 3).
-- create or replace keeps the owner and grants (signed-in users may call it).
create or replace function public.my_bookings() returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_signed_in();
  return query
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
    from public.appointments a
    cross join public.business_settings s
    where s.id = 1
      and a.customer_id = auth.uid()
      and a.anonymized_at is null
    order by a.service_date desc, a.start_min desc;
end
$$;
