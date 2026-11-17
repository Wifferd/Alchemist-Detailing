-- Migration 011, part 10 (last): switch the menu over. Apply only after parts 1-9 (review S3: until now the new rows
-- were switched off, so the old menu kept working with the new quote functions).
--
-- On: the six services, six add-ons and three inside-answer fees of the new menu, and the new inside answers.
-- Off (active = false, never removed: old bookings point to them): the old services, add-ons and condition fees, and
-- the old condition answers. No mobile fee on anything (owner, Nov 16), old rows included (spec: "mobile_pct = 0 on
-- everything"). Vehicle types are relabelled by rows (codes unchanged). The offer ends Feb 17, 2027 (owner).
-- Not here: live's business_settings.guest_booking = true, a go-live step run only with the owner's go-ahead.

update public.services set active = true
 where code in ('basic_wash', 'hand_wash', 'inside_out', 'full_detail_v2', 'interior_clean', 'interior_detail',
                'wheels_tire_shine', 'gloss_wax', 'engine_bay', 'film_care', 'leather_care', 'stain_removal',
                'cond_pet_some', 'cond_pet_lots', 'cond_heavy_dirt');

update public.services set active = false
 where code in ('ext_basic', 'ext_deluxe', 'int_basic', 'int_deluxe', 'signature_combo', 'full_detail',
                'perfect_finish_sealant', 'steam_cleaning',
                'cond_pet_hair', 'cond_dirt_sand', 'cond_spills', 'cond_heavy_stains')
   and active;

update public.services set mobile_pct = 0 where mobile_pct <> 0;

update public.form_options set active = true
 where list = 'condition' and code in ('pet_hair_some', 'pet_hair_lots', 'heavy_dirt');
update public.form_options set active = false
 where list = 'condition' and code in ('pet_hair', 'dirt_sand', 'spills', 'heavy_stains') and active;
update public.form_options set description = 'Tell us in the notes. We confirm the price before we start.'
 where list = 'condition' and code = 'other';

update public.vehicle_types t set name = v.name
from (values ('sedan', 'Sedan, hatchback or wagon'), ('crossover', 'Crossover, 2 rows'), ('suv', 'SUV, 2 rows'),
             ('large_suv', 'SUV, 3 rows'), ('truck', 'Pickup')) as v(code, name)
where t.code = v.code;

update public.business_settings set first_visit_offer_ends_on = date '2027-02-17' where id = 1;
