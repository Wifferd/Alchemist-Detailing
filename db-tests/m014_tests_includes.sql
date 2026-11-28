-- Migration 014 checks: one DO block that raises its result (read-only: no row is written).
do $t$
declare n int; bad text := '';
begin
  select count(*) into n from public.service_includes si
    join public.services s on s.id = si.service_id and s.code = 'hand_wash'
    join public.services i on i.id = si.included_id and i.code = 'wheels_tire_shine';
  if n <> 1 then bad := bad || ' [hand_wash includes wheels_tire_shine: ' || n || ' rows, expected 1]'; end if;
  select count(*) into n from public.service_includes si
    join public.services s on s.id = si.service_id and s.code in ('full_detail_v2','interior_detail')
    join public.services i on i.id = si.included_id and i.code = 'leather_care';
  if n <> 2 then bad := bad || ' [leather care in the Full Detail and Interior Detail: ' || n || ', expected 2]'; end if;
  -- no price changed: the add-on and the Hand Wash keep their rates
  select count(*) into n from public.service_size_rates r join public.services s on s.id = r.service_id and s.code = 'wheels_tire_shine' where r.price_cents <> 2000;
  if n <> 0 then bad := bad || ' [wheels_tire_shine rate changed]'; end if;
  if bad <> '' then raise exception 'm014 FAILED:%', bad; end if;
  raise exception 'm014 PASSED (3 checks)';
end $t$;
