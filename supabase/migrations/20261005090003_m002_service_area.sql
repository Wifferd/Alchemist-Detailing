-- Migration 002, part 3: the three borderline ZIP codes are in (doc 24).
-- The 10-mile circle is measured from the owner's home; the public area stays Parker, Texas.
insert into public.service_zip_codes (zip, place) values
  ('75072', 'McKinney'),
  ('75407', 'Princeton'),
  ('75042', 'Garland')
on conflict (zip) do nothing;
