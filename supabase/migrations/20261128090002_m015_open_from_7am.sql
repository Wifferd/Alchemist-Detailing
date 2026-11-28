-- Migration 015 (Nov 28, 2026): bookings open from 7 AM.
--
-- The owner: "Make bookings open from 7am". The first start time of every day moves from 10:00 AM (600) to 7:00 AM
-- (420). Nothing else changes: starts stay every 30 minutes, the last start is 7:00 PM, jobs still end by 8 PM, and
-- the weekly closures stay (Mon to Thu closed 4 to 8 PM, Fri closed 12 to 5 PM), so the days read:
-- Mon to Thu 7 AM to 4 PM, Fri 7 AM to 12 PM and 5 to 8 PM, Sat and Sun 7 AM to 8 PM.
--
-- The site's four typed copies of the hours (footer, Contact, FAQ, LD+JSON) change with this: see doc 58.
-- NOT applied anywhere yet. Test project first, then live only on the owner's "push".

update public.business_settings set first_start_min = 420 where id = 1;
