-- Migration 008, part 1 (Nov 7, 2026; the owner's answer 1 to doc 45, "Yes to all"):
-- a job is started only on its own day, and completed on that day or later (Parker's date, public.local_today()),
-- so a mis-tap can't mark a future job started or done. A job finished late can still be closed the next day,
-- and complete_booking still takes a confirmed job that was never started.
-- Both functions are the live definitions (Migration 001) with one new check each, after the status check; the
-- message names the job's day (with its year when that isn't this year). create or replace keeps their owner
-- and grants (authenticated may call them; assert_manager does the rest).
create or replace function public.start_booking(p_id uuid) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_day text;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status <> 'confirmed' then
    perform public.fail('wrong_state', 'Only confirmed bookings can be started.');
  end if;
  if a.service_date <> public.local_today() then
    v_day := to_char(a.service_date, 'Dy, Mon FMDD')
      || case when extract(year from a.service_date) <> extract(year from public.local_today())
              then to_char(a.service_date, ', YYYY') else '' end;
    if a.service_date > public.local_today() then
      perform public.fail('wrong_state', 'This job is on ' || v_day || '. Start it on that day.');
    end if;
    perform public.fail('wrong_state', 'This job was on ' || v_day
      || '. A job is started only on its own day: complete it, or change its time.');
  end if;
  update public.appointments x set status = 'in_progress' where x.id = a.id returning * into a;
  return a;
end
$$;

create or replace function public.complete_booking(p_id uuid, p_note text default null) returns public.appointments
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v_day text;
begin
  perform public.assert_manager();
  a := public.booking_for_update(p_id);
  if a.status not in ('confirmed', 'in_progress') then
    perform public.fail('wrong_state', 'Only confirmed or started bookings can be completed.');
  end if;
  if a.service_date > public.local_today() then
    v_day := to_char(a.service_date, 'Dy, Mon FMDD')
      || case when extract(year from a.service_date) <> extract(year from public.local_today())
              then to_char(a.service_date, ', YYYY') else '' end;
    perform public.fail('wrong_state', 'This job is on ' || v_day || '. It can be completed on that day or later.');
  end if;
  perform public.set_action_note(p_note);
  update public.appointments x set status = 'completed' where x.id = a.id returning * into a;
  perform public.clear_action_note();
  return a;
end
$$;
