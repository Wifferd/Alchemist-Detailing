-- Migration 012, part 6 (last, with the deploy of the site that shows it): the new prices, and all three deals on.
--
-- The owner (Nov 18): Basic Wash $59.99 (his answer "$59.99 (Recommended)"; his first words said $109.99), "89.99 for
-- hand wash", Inside & Out and the Full Detail higher with "the same savings" (his answer "Keep the same savings
-- (Recommended)"). Cents; car / SUV 2 rows / 3 rows or pickup / minivan:
--   basic_wash      5999 /  6499 /  6499 /  6499
--   hand_wash       8999 /  9499 /  9499 /  9499
--   inside_out     11499 / 12999 / 13999 / 14999   (Hand Wash + Interior Clean less $50 / $50 / $45 / $45)
--   full_detail_v2 17999 / 20499 / 22999 / 24999   (Hand Wash + Interior Detail less $35 / $35 / $30 / $30)
-- Interior Clean, Interior Detail, add-ons, inside-answer fees and every service's minutes and description: unchanged.
-- services.base_price_cents keeps the car figure for old readers (Migration 011, check A4).
-- The retired first_visit_price_cents column is emptied (the deals live in first_visit_deal_rates since part 1).

update public.service_size_rates set first_visit_price_cents = null where first_visit_price_cents is not null;

update public.service_size_rates r set price_cents = v.price
from public.services s,
     (values ('basic_wash', 'car', 5999), ('basic_wash', 'two_rows', 6499), ('basic_wash', 'three_rows', 6499), ('basic_wash', 'minivan', 6499),
             ('hand_wash', 'car', 8999), ('hand_wash', 'two_rows', 9499), ('hand_wash', 'three_rows', 9499), ('hand_wash', 'minivan', 9499),
             ('inside_out', 'car', 11499), ('inside_out', 'two_rows', 12999), ('inside_out', 'three_rows', 13999), ('inside_out', 'minivan', 14999),
             ('full_detail_v2', 'car', 17999), ('full_detail_v2', 'two_rows', 20499), ('full_detail_v2', 'three_rows', 22999), ('full_detail_v2', 'minivan', 24999)
     ) as v(code, size_group, price)
where s.id = r.service_id and s.code = v.code and r.size_group = v.size_group and r.price_cents is distinct from v.price;

update public.services s set base_price_cents = v.price
from (values ('basic_wash', 5999), ('hand_wash', 8999), ('inside_out', 11499), ('full_detail_v2', 17999)) as v(code, price)
where s.code = v.code and s.base_price_cents is distinct from v.price;

update public.first_visit_deals set active = true where code in ('inside', 'both') and not active;
