-- Migration 011, part 3a: the sizes, the vehicle types' sizes, the new services and their prices and minutes.
--
-- The new services go in switched off (active = false): nothing on sale changes until part 10, which is applied last,
-- after the new quote functions (review S3). Prices are whole dollars (owner, Nov 16-17). Minutes are the real on-site
-- minutes (setup 12 + work + pack-up 12 + handover 8), unrounded, from model_launch (the "3 rows or pickup" column holds
-- the model's 3-row SUV, the slowest vehicle of that size); Basic Wash: the owner's "1 hour max" on a car scaled
-- 60 / 71.25 / 82.5 plus 32. Add-ons and inside answers: their own hands-on minutes per size.
-- base_price_cents and duration_min hold the car figures only so the untouched constraints hold; nothing new reads them.

insert into public.size_groups (code, name, short_name, sort) values
  ('car', 'Car', 'Car', 1),
  ('two_rows', 'SUV or crossover, 2 rows', '2 rows', 2),
  ('three_rows', '3 rows or pickup', '3 rows or pickup', 3),
  ('minivan', 'Minivan', 'Minivan', 4);

update public.vehicle_types t set size_group = v.g
from (values ('sedan', 'car'), ('coupe', 'car'), ('convertible', 'car'),
             ('crossover', 'two_rows'), ('suv', 'two_rows'),
             ('large_suv', 'three_rows'), ('truck', 'three_rows'),
             ('minivan', 'minivan')) as v(code, g)
where t.code = v.code;

insert into public.services
  (code, kind, name, description, base_price_cents, priced_by_vehicle_type, priced_by_size, duration_min, mobile_pct, active, sort)
values
  ('basic_wash', 'exterior', 'Basic Wash',
   'Thick foam to loosen the dirt, then a careful two-bucket hand wash. Rinsed and hand-dried. Wheels and tires are rinsed with the car. For cars with normal road dirt. Not included: wheel and tire scrubbing, tire shine, bug and tar removal, window cleaning. Add Wheels & Tire Shine for $20.',
   5000, false, true, 92, 0, false, 10),
  ('hand_wash', 'exterior', 'Hand Wash',
   'Thick foam to loosen the dirt, then a careful two-bucket hand wash. Wheels and tires cleaned; tire shine. Rinsed, hand-dried and blown out. Outside glass.',
   7500, false, true, 91, 0, false, 20),
  ('inside_out', 'bundle', 'Inside & Out',
   'Everything in the Hand Wash, plus: seats, carpets and trunk vacuumed. Dash, doors, console and cup holders wiped. Mats scrubbed and left dry; inside windows. A protectant on the dash and trim.',
   10000, false, true, 163, 0, false, 30),
  ('full_detail_v2', 'bundle', 'Full Detail',
   'Everything in Inside & Out, plus: outside, a bug and road-grime pre-soak, wheel wells scrubbed and a water-repellent sealant foam. Cloth seats and carpets shampooed and the dirty water pulled back out with an extractor (seats stay damp a few hours); leather cleaned and conditioned instead where the car has it. Console, vents, seams and cup holders steamed and brushed. Door seals dressed.',
   16500, false, true, 315, 0, false, 40),
  ('interior_clean', 'interior', 'Interior Clean',
   'The inside of Inside & Out, no wash: seats, carpets and trunk vacuumed. Dash, doors, console and cup holders wiped. Mats scrubbed and left dry; inside windows. A protectant on the dash and trim.',
   7500, false, true, 103, 0, false, 50),
  ('interior_detail', 'interior', 'Interior Detail',
   'The inside of the Full Detail, no wash: everything in the Interior Clean, plus cloth seats and carpets shampooed and the dirty water pulled back out with an extractor (seats stay damp a few hours); leather cleaned and conditioned instead where the car has it. Console, vents, seams and cup holders steamed and brushed. Door seals dressed.',
   12500, false, true, 229, 0, false, 60),
  ('wheels_tire_shine', 'addon', 'Wheels & Tire Shine',
   'Wheels and tires scrubbed, then tire shine. Goes with the Basic Wash (the Hand Wash already has it).',
   2000, false, true, 19, 0, false, 110),
  ('gloss_wax', 'addon', 'Gloss wax foam',
   'A gloss wax foam after the wash, for shine and water beading.',
   2000, false, true, 10, 0, false, 120),
  ('engine_bay', 'addon', 'Engine bay clean',
   'The engine bay cleaned.',
   5000, false, true, 25, 0, false, 130),
  ('film_care', 'addon', 'Clear film (PPF) care',
   'Every wash is already safe for clear film. This adds a hand clean of the film''s edges and any spots on it, with a cleaner made for film.',
   1500, false, true, 12, 0, false, 140),
  ('leather_care', 'addon', 'Leather care',
   'Leather seats cleaned and conditioned. Already in the Full Detail and the Interior Detail.',
   3500, false, true, 25, 0, false, 150),
  ('stain_removal', 'addon', 'Stain and spill removal (up to 5 spots)',
   'Set-in stains and spills treated one by one, up to 5 spots. More than 5? We tell you the price first.',
   4000, false, true, 33, 0, false, 160),
  ('cond_pet_some', 'addon', 'Some pet hair',
   'Hair on the seats and carpet that comes up with a vacuum and a rubber brush.',
   3000, false, true, 20, 0, false, 210),
  ('cond_pet_lots', 'addon', 'A lot of pet hair',
   'Hair woven into the fabric, on most seats and in the cargo area.',
   6000, false, true, 45, 0, false, 220),
  ('cond_heavy_dirt', 'addon', 'Heavy dirt, mud or sand',
   'Heavy dirt, mud or sand inside the vehicle.',
   4000, false, true, 25, 0, false, 230);

-- Price (cents), first-visit price (cents, Basic Wash only) and minutes, per size: car, two_rows, three_rows, minivan.
insert into public.service_size_rates (service_id, size_group, price_cents, first_visit_price_cents, minutes)
select s.id, v.g, v.price, v.fv, v.mins
from (values
  ('basic_wash', 'car', 5000, 3500, 92), ('basic_wash', 'two_rows', 5500, 4000, 103.25),
  ('basic_wash', 'three_rows', 5500, 4000, 114.5), ('basic_wash', 'minivan', 5500, 4000, 114.5),
  ('hand_wash', 'car', 7500, null, 91), ('hand_wash', 'two_rows', 8000, null, 101),
  ('hand_wash', 'three_rows', 8000, null, 111), ('hand_wash', 'minivan', 8000, null, 111),
  ('inside_out', 'car', 10000, null, 163), ('inside_out', 'two_rows', 11500, null, 190.75),
  ('inside_out', 'three_rows', 12500, null, 218.5), ('inside_out', 'minivan', 13500, null, 236.25),
  ('full_detail_v2', 'car', 16500, null, 315), ('full_detail_v2', 'two_rows', 19000, null, 375.75),
  ('full_detail_v2', 'three_rows', 21500, null, 436.5), ('full_detail_v2', 'minivan', 23500, null, 483.25),
  ('interior_clean', 'car', 7500, null, 103), ('interior_clean', 'two_rows', 8500, null, 120.75),
  ('interior_clean', 'three_rows', 9000, null, 138.5), ('interior_clean', 'minivan', 10000, null, 156.25),
  ('interior_detail', 'car', 12500, null, 229), ('interior_detail', 'two_rows', 14500, null, 275.75),
  ('interior_detail', 'three_rows', 16500, null, 322.5), ('interior_detail', 'minivan', 18500, null, 369.25),
  ('wheels_tire_shine', 'car', 2000, null, 19), ('wheels_tire_shine', 'two_rows', 2000, null, 21.5),
  ('wheels_tire_shine', 'three_rows', 2000, null, 24), ('wheels_tire_shine', 'minivan', 2000, null, 24),
  ('gloss_wax', 'car', 2000, null, 10), ('gloss_wax', 'two_rows', 2000, null, 11.5),
  ('gloss_wax', 'three_rows', 2000, null, 13), ('gloss_wax', 'minivan', 2000, null, 13),
  ('engine_bay', 'car', 5000, null, 25), ('engine_bay', 'two_rows', 5000, null, 27.5),
  ('engine_bay', 'three_rows', 5000, null, 30), ('engine_bay', 'minivan', 5000, null, 30),
  ('film_care', 'car', 1500, null, 12), ('film_care', 'two_rows', 1500, null, 13.5),
  ('film_care', 'three_rows', 1500, null, 15), ('film_care', 'minivan', 1500, null, 15),
  ('leather_care', 'car', 3500, null, 25), ('leather_care', 'two_rows', 3500, null, 30),
  ('leather_care', 'three_rows', 3500, null, 35), ('leather_care', 'minivan', 3500, null, 35),
  ('stain_removal', 'car', 4000, null, 33), ('stain_removal', 'two_rows', 4000, null, 41.25),
  ('stain_removal', 'three_rows', 4000, null, 49.5), ('stain_removal', 'minivan', 4000, null, 57.75),
  ('cond_pet_some', 'car', 3000, null, 20), ('cond_pet_some', 'two_rows', 3000, null, 22.5),
  ('cond_pet_some', 'three_rows', 3000, null, 25), ('cond_pet_some', 'minivan', 3000, null, 25),
  ('cond_pet_lots', 'car', 6000, null, 45), ('cond_pet_lots', 'two_rows', 6000, null, 52.5),
  ('cond_pet_lots', 'three_rows', 6000, null, 60), ('cond_pet_lots', 'minivan', 6000, null, 60),
  ('cond_heavy_dirt', 'car', 4000, null, 25), ('cond_heavy_dirt', 'two_rows', 4000, null, 30),
  ('cond_heavy_dirt', 'three_rows', 4000, null, 35), ('cond_heavy_dirt', 'minivan', 4000, null, 35)
) as v(code, g, price, fv, mins)
join public.services s on s.code = v.code;
