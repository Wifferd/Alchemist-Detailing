-- Migration 015 checks (read-only; one DO block that raises its result). Run after the migration is applied.
do $t$
declare mon date; bad text := ''; n int;
begin
  select first_start_min into n from public.business_settings where id = 1;
  if n <> 420 then bad := bad || ' [first_start_min is ' || n || ', expected 420]'; end if;
  -- a Monday 46 to 52 days ahead, as in m003
  mon := current_date + 46 + ((8 - extract(isodow from current_date + 46)::int) % 7);
  if not (420 = any (public.get_availability(mon, 60, 'mobile'))) then bad := bad || ' [Monday 7:00 AM, 60 min, is not offered]'; end if;
  if (select min(x) from unnest(public.get_availability(mon, 60, 'mobile')) x) <> 420 then bad := bad || ' [Monday: the first start is not 7:00 AM]'; end if;
  if 390 = any (public.get_availability(mon, 60, 'mobile')) then bad := bad || ' [Monday 6:30 AM is offered]'; end if;
  if (select max(x) from unnest(public.get_availability(mon, 60, 'mobile')) x) <> 900 then bad := bad || ' [Monday: the last start moved from 3:00 PM]'; end if;
  if not (420 = any (public.get_availability(mon + 4, 60, 'mobile'))) then bad := bad || ' [Friday 7:00 AM is not offered]'; end if;
  if 780 = any (public.get_availability(mon + 4, 60, 'mobile')) then bad := bad || ' [Friday 1:00 PM is offered: the closure moved]'; end if;
  if not (420 = any (public.get_availability(mon + 5, 60, 'mobile'))) then bad := bad || ' [Saturday 7:00 AM is not offered]'; end if;
  if bad <> '' then raise exception 'm015 FAILED:%', bad; end if;
  raise exception 'm015 PASSED (8 checks)';
end $t$;
