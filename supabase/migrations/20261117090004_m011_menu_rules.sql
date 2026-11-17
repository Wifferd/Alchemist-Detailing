-- Migration 011, part 3b: how the new services fit together, and the new "What's the inside like?" answers.
-- Still switched off: the new answers go in with active = false; part 10 turns them on and retires the old ones.

-- Inside & Out = Hand Wash + Interior Clean; Full Detail = Hand Wash + Interior Detail.
insert into public.bundle_parts (bundle_id, part_id)
select b.id, p.id
from (values ('inside_out', 'hand_wash'), ('inside_out', 'interior_clean'),
             ('full_detail_v2', 'hand_wash'), ('full_detail_v2', 'interior_detail')) as v(bundle, part)
join public.services b on b.code = v.bundle
join public.services p on p.code = v.part;

-- Leather care is part of the Full Detail and the Interior Detail (shown as Included, never charged twice).
insert into public.service_includes (service_id, included_id)
select s.id, i.id
from (values ('full_detail_v2', 'leather_care'), ('interior_detail', 'leather_care')) as v(svc, inc)
join public.services s on s.code = v.svc
join public.services i on i.code = v.inc;

-- What each add-on needs in the same booking (exterior or interior part, or any main service).
insert into public.addon_rules (addon_id, needs)
select s.id, v.needs
from (values ('wheels_tire_shine', 'exterior'), ('gloss_wax', 'exterior'), ('engine_bay', 'any_main'),
             ('film_care', 'exterior'), ('leather_care', 'interior'), ('stain_removal', 'interior'),
             ('cond_pet_some', 'interior'), ('cond_pet_lots', 'interior'), ('cond_heavy_dirt', 'interior')) as v(code, needs)
join public.services s on s.code = v.code;

-- Add-ons sold only with named services (the service the customer picks, not a bundle's parts):
-- Wheels & Tire Shine with the Basic Wash; Gloss wax foam with the Basic Wash, Hand Wash or Inside & Out;
-- Leather care with Inside & Out or the Interior Clean.
insert into public.addon_allowed_with (addon_id, service_id)
select a.id, s.id
from (values ('wheels_tire_shine', 'basic_wash'),
             ('gloss_wax', 'basic_wash'), ('gloss_wax', 'hand_wash'), ('gloss_wax', 'inside_out'),
             ('leather_care', 'inside_out'), ('leather_care', 'interior_clean')) as v(addon, svc)
join public.services a on a.code = v.addon
join public.services s on s.code = v.svc;

-- The new inside answers (fees per size come from the cond_ services' rates). Only one of the two pet-hair answers.
insert into public.form_options
  (list, code, label, is_none, sends_to_review, holds_price, requires_note, sort, active, fee_code, choice_group, description)
values
  ('condition', 'pet_hair_some', 'Some pet hair', false, false, false, false, 2, false, 'cond_pet_some', 'pet',
   'Hair on the seats and carpet that comes up with a vacuum and a rubber brush.'),
  ('condition', 'pet_hair_lots', 'A lot of pet hair', false, false, false, false, 3, false, 'cond_pet_lots', 'pet',
   'Hair woven into the fabric, on most seats and in the cargo area.'),
  ('condition', 'heavy_dirt', 'Heavy dirt, mud or sand', false, false, false, false, 4, false, 'cond_heavy_dirt', null,
   null);
