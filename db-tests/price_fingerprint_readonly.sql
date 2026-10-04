-- Fingerprint of all 6,480 menu quotes, read-only: nothing in the database
-- changes (no test minutes for Steam and the Sealant, so quotes with them show
-- whatever the menu gives today). For comparing a live database with the
-- tested build. Only a temporary helper is created, gone when the session ends.
create function pg_temp.quote_or_error(p jsonb) returns jsonb
language plpgsql as $f$
declare v_msg text;
begin
  return public.quote_booking(p);
exception when others then
  get stacked diagnostics v_msg = message_text;
  return jsonb_build_object('error', v_msg);
end
$f$;
with locs(loc) as (values ('shop'), ('mobile')),
     mains(bundle, ext, intr) as (
       values ('signature_combo', null, null), ('full_detail', null, null),
              (null, 'ext_basic', null), (null, 'ext_deluxe', null),
              (null, null, 'int_basic'), (null, null, 'int_deluxe'),
              (null, 'ext_basic', 'int_basic'), (null, 'ext_basic', 'int_deluxe'),
              (null, 'ext_deluxe', 'int_basic'), (null, 'ext_deluxe', 'int_deluxe')),
     addons(addons) as (
       values ('[]'::jsonb), ('["steam_cleaning"]'), ('["perfect_finish_sealant"]'),
              ('["steam_cleaning","perfect_finish_sealant"]')),
     vehicles(vtype, size, not_sure, stains) as (
       select t.vtype, z.size, false, st.stains
       from unnest(array['sedan', 'coupe', 'convertible', 'crossover', 'suv', 'minivan', 'truck',
                         'large_suv', 'van', 'other']) as t(vtype)
       cross join unnest(array['standard', 'xl']) as z(size)
       cross join (values ('[]'::jsonb), ('["light"]'), ('["heavy"]'), ('["heavy","pet"]')) as st(stains)
       union all
       select null, 'standard', true, '[]'::jsonb),
     inputs as (
       select jsonb_build_object('location_type', l.loc, 'bundle', m.bundle, 'exterior', m.ext, 'interior', m.intr,
                                 'addons', a.addons, 'vehicle_type', v.vtype, 'vehicle_size', v.size,
                                 'not_sure', v.not_sure, 'stains', v.stains) as input
       from locs l cross join mains m cross join addons a cross join vehicles v)
select count(*) as quotes,
       md5(string_agg(i.input::text || '=>' || pg_temp.quote_or_error(i.input)::text, E'\n'
                      order by i.input::text collate "C")) as fingerprint
from inputs i;
