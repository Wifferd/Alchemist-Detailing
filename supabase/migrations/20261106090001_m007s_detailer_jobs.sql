-- Alchemist Detailing — Migration 007s: a detailer reads their jobs through my_jobs(), not the booking tables (doc 28).
--
-- Doc 28 (Q-T2, decided): a detailer sees no prices and no customer phone number or email. Until now only the Team
-- page's own column list kept those out: the SELECT policies on appointments, appointment_items and
-- appointment_events let a detailer read every column of the bookings assigned to them (contact_phone,
-- contact_email, total_cents, price_cents ...), with a plain /rest/v1 call. Column grants can't tell a detailer from
-- a manager (both are the "authenticated" role), so:
--   1. my_jobs(p_from): the bookings assigned to the caller, with only the columns the Team page shows, and the
--      booking lines as code, name, included and sort (no prices). It checks assert_staff() first, so a manager
--      or the admin needs the authenticator code (Migration 006), like open_jobs.
--   2. The three SELECT policies become managers (and the admin) only. open_jobs, request_job, request_review and
--      can_view_vehicle_photo (the photo policy) are security definer and read the tables themselves, so open
--      jobs, the messages to the owner and the customer's photos keep working for an assigned detailer.
--
-- Applied to the test project on Nov 6 2026 (24 checks in db-tests/m007s_tests.sql; m006's suite passes too, with
-- its detailer table check updated). NOT on the live project: that needs the owner's OK. Not destructive: a new function and three
-- policies narrowed in place (alter policy). The Team page calls my_jobs and, where the function doesn't exist
-- yet (the live project before this migration), reads the table as before, limited to the caller's assignments.

create or replace function public.my_jobs(p_from date default null)
returns table (
  id uuid, ref text, service_date date, start_min integer, duration_min integer,
  location_type public.location_type, address text, address_zip text, status public.appointment_status,
  vehicle_year integer, vehicle_make text, vehicle_model text, vehicle_color text, vehicle_type text,
  vehicle_size public.vehicle_size, vehicle_not_sure boolean, vehicle_description text,
  modifications text[], conditions text[], damage text[], damage_note text, special_request text,
  photo_paths text[], items jsonb)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.assert_staff();
  return query
    select a.id, a.ref, a.service_date, a.start_min, a.duration_min,
           a.location_type, a.address, a.address_zip, a.status,
           a.vehicle_year, a.vehicle_make, a.vehicle_model, a.vehicle_color, a.vehicle_type,
           a.vehicle_size, a.vehicle_not_sure, a.vehicle_description,
           a.modifications, a.conditions, a.damage, a.damage_note, a.special_request,
           a.photo_paths,
           coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'name', i.name, 'included', i.included, 'sort', i.sort) order by i.sort)
                       from public.appointment_items i where i.appointment_id = a.id), '[]'::jsonb)
    from public.appointments a
    where exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id and x.employee_id = auth.uid())
      and a.status in ('confirmed', 'in_progress', 'completed')
      and a.anonymized_at is null
      and a.service_date >= coalesce(p_from, public.local_today() - 14)
    order by a.service_date, a.start_min;
end
$$;
comment on function public.my_jobs(date) is 'The bookings assigned to the caller (confirmed, started or done, from p_from, default 14 days back), with only what a detailer may see: no prices, no customer contact details (doc 28, Migration 007s).';
revoke all on function public.my_jobs(date) from public, anon;
grant execute on function public.my_jobs(date) to authenticated;

alter policy "Bookings: managers, or assigned team members" on public.appointments
  using ((select public.is_manager()));
alter policy "Bookings: managers, or assigned team members" on public.appointments
  rename to "Bookings: managers";

alter policy "Booking lines: managers, or assigned team members" on public.appointment_items
  using ((select public.is_manager()));
alter policy "Booking lines: managers, or assigned team members" on public.appointment_items
  rename to "Booking lines: managers";

alter policy "Booking history: managers, or assigned team members" on public.appointment_events
  using ((select public.is_manager()));
alter policy "Booking history: managers, or assigned team members" on public.appointment_events
  rename to "Booking history: managers";
