-- Test helpers for Migration 001. Creates schema "tst"; drop it after testing:
--   drop schema tst cascade;
-- Each check writes one row to tst.results. Switch identities with
--   reset role; select tst.login('<user id>', 'aal1' | 'aal2'); set role authenticated;
--   reset role; select tst.logout(); set role anon;

create schema tst;
grant usage on schema tst to anon, authenticated, service_role;

create table tst.results (
  id bigserial primary key,
  label text not null,
  passed boolean not null,
  detail text
);
create table tst.vars (k text primary key, v text);
grant select, insert, update on tst.results, tst.vars to anon, authenticated, service_role;
grant usage on all sequences in schema tst to anon, authenticated, service_role;

create function tst.login(p_user uuid, p_aal text default 'aal1') returns void
language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, false);
$$;

create function tst.logout() returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
$$;

create function tst.ok(p_cond boolean, p_label text, p_detail text default null) returns boolean
language plpgsql as $$
begin
  insert into tst.results (label, passed, detail) values (p_label, coalesce(p_cond, false), p_detail);
  return coalesce(p_cond, false);
end
$$;

create function tst.eq(p_got text, p_want text, p_label text) returns boolean
language plpgsql as $$
begin
  insert into tst.results (label, passed, detail)
  values (p_label, p_got is not distinct from p_want,
          'got ' || coalesce(p_got, 'null') || ', want ' || coalesce(p_want, 'null'));
  return p_got is not distinct from p_want;
end
$$;

-- Runs a statement that must fail: p_want is the error code our functions
-- raise (the message of SQLSTATE P0001) or a SQLSTATE such as 42501.
create function tst.err(p_sql text, p_want text, p_label text) returns boolean
language plpgsql as $$
declare
  v_state text;
  v_msg text;
  v_detail text;
  v_pass boolean;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
    v_pass := (v_state = 'P0001' and v_msg = p_want) or v_state = p_want;
    insert into tst.results (label, passed, detail)
    values (p_label, v_pass, v_state || ': ' || v_msg || coalesce(' / ' || nullif(v_detail, ''), ''));
    return v_pass;
  end;
  insert into tst.results (label, passed, detail) values (p_label, false, 'no error raised');
  return false;
end
$$;

-- Runs a query returning one value, as text; errors come back as text too.
create function tst.q(p_sql text) returns text
language plpgsql as $$
declare
  r text;
  v_state text;
  v_msg text;
begin
  execute p_sql into r;
  return r;
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  return 'ERROR ' || v_state || ': ' || v_msg;
end
$$;

create function tst.setv(p_k text, p_v text) returns text
language sql as $$
  insert into tst.vars (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v;
  select p_v;
$$;

create function tst.getv(p_k text) returns text
language sql stable as $$ select v from tst.vars where k = p_k $$;

-- Days relative to "today" in the business time zone.
create function tst.d(p_offset int) returns date
language sql stable security definer set search_path = '' as $$ select public.local_today() + p_offset $$;

-- A booking payload with sensible defaults; p_extra overrides any key.
create function tst.booking(p_loc text, p_date date, p_start int, p_extra jsonb default '{}') returns jsonb
language sql volatile as $$
  select jsonb_build_object(
           'request_id', gen_random_uuid(),
           'location_type', p_loc,
           'service_date', p_date,
           'start_min', p_start,
           'vehicle_make', 'Honda', 'vehicle_model', 'Civic', 'vehicle_year', '2019', 'vehicle_color', 'Blue',
           'vehicle_type', 'sedan', 'vehicle_size', 'standard',
           'bundle', 'signature_combo',
           'damage', jsonb_build_array('none'),
           'conditions', jsonb_build_array('none'),   -- required with an interior service since Migration 002
           'address', case when p_loc = 'mobile' then '123 Main St' end,
           'address_zip', case when p_loc = 'mobile' then '75002' end)
         || p_extra
$$;

grant execute on all functions in schema tst to anon, authenticated, service_role;
