-- Migration 002: condition fees (doc 24). Run after m001_framework.sql and
-- m001_fixtures.sql, on a database with Migration 002 applied.
-- Labels start with "m002:" so the results can be read on their own.
reset role;
create or replace function tst.quote_err(p jsonb) returns text
language plpgsql as $$
declare m text; d text; h text;
begin
  perform public.quote_booking(p);
  return 'OK';
exception when others then
  get stacked diagnostics m = message_text, h = pg_exception_hint;
  return m || '@' || coalesce(h, '');
end $$;
grant execute on function tst.quote_err(jsonb) to anon, authenticated;

set role anon;
-- Prices (shop unless said): fee lines, Included lines, totals.
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["pet_hair"]}') ->> 'total_cents'), '7499', 'm002: Interior Basic + pet hair = $74.99');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["dirt_sand"]}') ->> 'total_cents'), '6999', 'm002: Interior Basic + dirt = $69.99');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["spills"]}') ->> 'total_cents'), '6999', 'm002: Interior Basic + spills = $69.99');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["heavy_stains"]}') ->> 'total_cents'), '8999', 'm002: Interior Basic + heavy stains = $89.99');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["pet_hair","dirt_sand","spills","heavy_stains"]}') ->> 'total_cents'), '12499', 'm002: all four fees add up');
select tst.eq((public.quote_booking('{"location_type":"mobile","interior":"int_basic","conditions":["pet_hair","heavy_stains"]}') ->> 'mobile_cents'), '263', 'm002: mobile adds 2.5% on fees (150 + 38 + 75)');
select tst.eq((public.quote_booking('{"location_type":"mobile","interior":"int_basic","conditions":["pet_hair","heavy_stains"]}') ->> 'total_cents'), '10762', 'm002: mobile total with fees');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_deluxe","conditions":["pet_hair","dirt_sand","spills"]}') ->> 'total_cents'), '13499', 'm002: Interior Deluxe includes the three lighter fees');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_deluxe","conditions":["heavy_stains"]}') ->> 'total_cents'), '16499', 'm002: Interior Deluxe still pays heavy stains');
select tst.eq((public.quote_booking('{"location_type":"shop","bundle":"full_detail","conditions":["pet_hair"]}') ->> 'total_cents'), '20999', 'm002: Full Detail includes pet hair');
select tst.eq((public.quote_booking('{"location_type":"shop","bundle":"signature_combo","conditions":["pet_hair"]}') ->> 'total_cents'), '11499', 'm002: Signature Combo pays pet hair');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["none"]}') ->> 'total_cents'), '5999', 'm002: None adds nothing');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["other"]}') ->> 'total_cents'), '5999', 'm002: Other adds nothing to the quote');
select tst.eq((public.quote_booking('{"location_type":"shop","exterior":"ext_basic","conditions":["none"]}') ->> 'total_cents'), '4999', 'm002: exterior only with None');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_deluxe"}') ->> 'total_cents'), '13499', 'm002: a quote without conditions still prices (service cards)');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","conditions":["pet_hair"]}') ->> 'duration_min'), '60', 'm002: fees add no minutes');
select tst.ok((select bool_and((l ->> 'included')::boolean) from jsonb_array_elements(public.quote_booking('{"location_type":"shop","interior":"int_deluxe","conditions":["pet_hair"]}') -> 'lines') l where l ->> 'code' = 'cond_pet_hair'), 'm002: an included fee is shown as Included');
select tst.ok(not exists (select 1 from jsonb_array_elements(public.quote_booking('{"location_type":"shop","interior":"int_deluxe","conditions":["none"]}') -> 'lines') l where l ->> 'code' like 'cond%'), 'm002: no fee lines appear unless chosen');
select tst.eq((public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic","conditions":["pet_hair"]}') -> 'suggestion' ->> 'saves_cents'), '999', 'm002: bundle suggestion still works with fees');
select tst.ok(not exists (select 1 from public.form_options where list = 'stain' and holds_price), 'm002: nothing in the stain list holds the price');
select tst.eq((select string_agg(code, ',' order by sort) from public.form_options where list = 'condition' and active), 'none,pet_hair,dirt_sand,spills,heavy_stains,other', 'm002: the condition list is None, four fees, Other');
select tst.ok(not exists (select 1 from public.form_options where list = 'condition' and code = 'odor' and active), 'm002: odor is retired');

-- Refusals.
select tst.eq(tst.quote_err('{"location_type":"shop","exterior":"ext_basic","conditions":["pet_hair"]}'), 'invalid_input@conditions', 'm002: fees refused on an exterior-only booking');
select tst.eq(tst.quote_err('{"location_type":"shop","interior":"int_basic","conditions":["none","pet_hair"]}'), 'invalid_input@conditions', 'm002: None can''t be combined');
select tst.eq(tst.quote_err('{"location_type":"shop","interior":"int_basic","conditions":["odor"]}'), 'invalid_input@conditions', 'm002: retired code refused');
select tst.eq(tst.quote_err('{"location_type":"shop","interior":"int_basic","addons":["cond_pet_hair"]}'), 'invalid_input@addons', 'm002: a fee can''t be sent as an add-on');
select tst.eq(tst.quote_err('{"location_type":"shop","exterior":"ext_basic","addons":["steam_cleaning"]}'), 'invalid_input@addons', 'm002: steam needs an interior service');
select tst.eq(tst.quote_err('{"location_type":"shop","interior":"int_basic","addons":["steam_cleaning"]}'), 'OK', 'm002: steam with Interior Basic is fine');
select tst.eq((public.quote_booking('{"location_type":"shop","interior":"int_basic","addons":["steam_cleaning"]}') ->> 'duration_min'), '90', 'm002: steam adds 30 minutes');
select tst.eq((public.quote_booking('{"location_type":"shop","exterior":"ext_basic","addons":["perfect_finish_sealant"],"vehicle_type":"sedan"}') ->> 'duration_min'), '90', 'm002: WetGloss adds 30 minutes');

-- Booking: the choice is required with an interior service; Other needs the note and goes to Review.
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d6');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(45), 600, '{"conditions":[]}'))$q$, 'invalid_input', 'm002: booking without a condition choice refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(45), 600, '{"conditions":["other"]}'))$q$, 'invalid_input', 'm002: Other without a note refused');
select tst.setv('m002a', public.submit_booking(tst.booking('shop', tst.d(45), 600, '{"bundle":null,"interior":"int_basic","conditions":["pet_hair","heavy_stains"]}')) ->> 'id');
select tst.setv('m002b', public.submit_booking(tst.booking('shop', tst.d(45), 600, '{"bundle":null,"exterior":"ext_basic","conditions":[]}')) ->> 'id');
select tst.setv('m002c', public.submit_booking(tst.booking('shop', tst.d(46), 600, '{"conditions":["other"],"special_request":"Toothpaste on the back seat."}')) ->> 'id');
reset role;
select tst.eq((select string_agg(code || ':' || price_cents, ',' order by sort) from public.appointment_items where appointment_id = tst.getv('m002a')::uuid), 'int_basic:5999,cond_pet_hair:1500,cond_heavy_stains:3000', 'm002: fee lines saved with the booking');
select tst.eq((select queue::text from public.appointments where id = tst.getv('m002a')::uuid), 'requests', 'm002: fees alone don''t send a booking to Review');
select tst.ok((select cardinality(conditions) = 0 from public.appointments where id = tst.getv('m002b')::uuid), 'm002: exterior only needs no condition choice');
select tst.eq((select queue::text from public.appointments where id = tst.getv('m002c')::uuid), 'review', 'm002: Other sends the booking to Review');
select tst.ok((select 'condition' = any (review_reasons) from public.appointments where id = tst.getv('m002c')::uuid), 'm002: Review reason recorded');
reset role;
