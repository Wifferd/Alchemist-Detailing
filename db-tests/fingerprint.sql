-- Fingerprint of what Migration 001 created, to compare two databases
-- (for example the local test run and a Supabase project).
select 'functions' as part, count(*) as n,
       md5(string_agg(p.proname || '|' || md5(p.prosrc) || '|' || p.prosecdef || '|' || p.provolatile::text || '|'
                      || coalesce(array_to_string(p.proconfig, ','), '') || '|' || pg_get_function_identity_arguments(p.oid)
                      || '|' || pg_get_function_result(p.oid), ',' order by p.proname)) as md5
from pg_proc p where p.pronamespace = 'public'::regnamespace
union all
select 'columns', count(*),
       md5(string_agg(c.table_name || '.' || c.column_name || ':' || c.data_type || ':' || c.is_nullable || ':'
                      || coalesce(c.column_default, '') || ':' || coalesce(c.generation_expression, ''), ',' order by c.table_name, c.ordinal_position))
from information_schema.columns c where c.table_schema = 'public'
union all
select 'constraints', count(*),
       md5(string_agg(c.relname || '.' || k.conname || ':' || pg_get_constraintdef(k.oid), ',' order by c.relname, k.conname))
from pg_constraint k join pg_class c on c.oid = k.conrelid where k.connamespace = 'public'::regnamespace
union all
select 'indexes', count(*), md5(string_agg(indexname || ':' || indexdef, ',' order by indexname))
from pg_indexes where schemaname = 'public'
union all
select 'policies', count(*),
       md5(string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':'
                      || coalesce(qual, '') || ':' || coalesce(with_check, ''), ',' order by schemaname, tablename, policyname))
from pg_policies where schemaname in ('public', 'storage') and (schemaname = 'public' or policyname like 'Vehicle photos%')
union all
select 'triggers', count(*), md5(string_agg(n.nspname || '.' || c.relname || '.' || t.tgname || ':' || t.tgenabled::text || ':' || md5(pg_get_triggerdef(t.oid)), ',' order by n.nspname, c.relname, t.tgname))
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and (n.nspname = 'public' or t.tgname like 'on_auth_user%')
union all
select 'grants', count(*), md5(string_agg(grantee || ':' || table_name || ':' || privilege_type, ',' order by grantee, table_name, privilege_type))
from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
union all
select 'column grants', count(*), md5(string_agg(grantee || ':' || table_name || '.' || column_name || ':' || privilege_type, ',' order by grantee, table_name, column_name, privilege_type))
from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and (table_name, privilege_type) not in (select table_name, privilege_type from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = column_privileges.grantee)
union all
select 'function grants', count(*), md5(string_agg(routine_name || ':' || grantee, ',' order by routine_name, grantee))
from information_schema.routine_privileges where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
union all
select 'seed', count(*), md5(string_agg(x, ',' order by x)) from (
  select 'svc:' || code || ':' || kind || ':' || coalesce(base_price_cents::text, '-') || ':' || coalesce(duration_min::text, '-') || ':' || mobile_pct as x from public.services
  union all select 'opt:' || list || ':' || code || ':' || is_none || sends_to_review || holds_price || requires_note from public.form_options
  union all select 'zip:' || zip from public.service_zip_codes
  union all select 'type:' || code from public.vehicle_types
  union all select 'price:' || service_type_prices.vehicle_type || ':' || price_cents from public.service_type_prices
  union all select 'settings:' || (to_jsonb(s) - 'updated_at')::text from public.business_settings s) t
order by 1;
