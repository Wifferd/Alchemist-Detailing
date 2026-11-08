-- Applied to the test project on Nov 6, 2026 (version 20261106204729) and to the live project on Nov 7, 2026 (version 20261107002002).
-- Migration 007, part 3: the free start times for moving a booking (the Admin page's Change time).
--
-- The panel asked get_availability, the customers' rule: from tomorrow on only, with the booking's own time still
-- in the way, so it never offered today, never the booking's own start, and (with one mobile job at a time) not
-- the times next to it either, although set_booking_time accepts all of those. staff_availability gives the
-- staff rule set_booking_time checks: open_starts with the booking left out and p_staff on (today and any day
-- ahead), less the times an assigned team member already has a job, plus the booking's own start when the day
-- stays and the length doesn't grow (set_booking_time takes that as is). Managers and the admin only.
create or replace function public.staff_availability(p_id uuid, p_date date, p_duration integer)
returns integer[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  a public.appointments;
  t integer[];
begin
  perform public.assert_manager();
  select * into a from public.appointments x where x.id = p_id;
  if not found then
    perform public.fail('not_found', 'That booking wasn''t found.');
  end if;
  if p_date is null then
    perform public.fail('invalid_input', 'Choose a day.', 'service_date');
  end if;
  if p_duration is null or p_duration < 5 or p_duration > 720 then
    perform public.fail('invalid_input', 'The length must be between 5 minutes and 12 hours.', 'duration_min');
  end if;
  t := coalesce((
    select array_agg(o.start_min order by o.start_min)
    from public.open_starts(p_date, 1, p_duration, a.location_type, a.id, true) o
    where not exists (select 1 from public.appointment_assignments x
                      where x.appointment_id = a.id
                        and public.person_conflicts(x.employee_id, p_date, o.start_min, p_duration, a.location_type, a.id))
  ), '{}');
  if p_date = a.service_date and p_duration <= a.duration_min and not (a.start_min = any (t)) then
    t := array(select u from unnest(t || a.start_min) as u order by u);
  end if;
  return t;
end
$$;
comment on function public.staff_availability(uuid, date, integer) is
  'Free start times for moving booking p_id to p_date with length p_duration, by the rule set_booking_time checks (Migration 007). Managers and the admin.';
revoke all on function public.staff_availability(uuid, date, integer) from public, anon;
grant execute on function public.staff_availability(uuid, date, integer) to authenticated;
