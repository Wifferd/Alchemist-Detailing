-- Migration 013 (Nov 24, 2026): the Hand Wash already includes Wheels & Tire Shine.
--
-- The owner's own words on the Services page: "The Hand Wash already has it." The booking page greyed that add-on out
-- for the Hand Wash, the Inside & Out and the Full Detail with the reason "Goes with the Basic Wash", because the
-- menu recorded nothing as included except Leather care (Full Detail, Interior Detail). With this row the booking page
-- says "Included, already in the Hand Wash" for all three (the Inside & Out and the Full Detail through their Hand Wash
-- part), as it already does for Leather care.
--
-- Prices and times do not change: the add-on stays Basic-Wash-only to buy, and a booking can never be charged for it
-- with a Hand Wash. One row, and it is safe to run twice.
--
-- NOT applied anywhere yet. Test project first (the owner's Supabase account must have room to bring it back), then
-- live only on the owner's "push". After it: db-tests/m013_tests_includes.sql.

insert into public.service_includes (service_id, included_id)
select h.id, w.id
  from public.services h
  join public.services w on w.code = 'wheels_tire_shine'
 where h.code = 'hand_wash'
   and not exists (select 1 from public.service_includes x where x.service_id = h.id and x.included_id = w.id);
