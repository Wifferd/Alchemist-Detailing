-- Migration 002, part 1: the owner's phase 1 answers (doc 23, Oct 5 2026).
-- Applied to the test project on Oct 5 2026. Not yet applied to live.

-- Steam Cleaning: 30 minutes, only with an interior job that doesn't include it.
update public.services set duration_min = 30 where code = 'steam_cleaning';
update public.addon_rules r set needs = 'interior'
  from public.services s where r.addon_id = s.id and s.code = 'steam_cleaning';

-- The sealant product is WetGloss (Koch-Chemie), 30 minutes. The code stays.
update public.services set name = 'WetGloss', duration_min = 30 where code = 'perfect_finish_sealant';

-- Travel time after a mobile job: 10 minutes. None after a driveway job.
update public.business_settings set mobile_buffer_min = 10, shop_buffer_min = 0, updated_at = now() where id = 1;

-- WetGloss description (doc 24). Applied to test on Oct 5 2026.
update public.services
set description = 'Spray-on sealant for gloss and water beading, added after a wash with an exterior service. Lasts several weeks, depending on weather and washing.'
where code = 'perfect_finish_sealant';
