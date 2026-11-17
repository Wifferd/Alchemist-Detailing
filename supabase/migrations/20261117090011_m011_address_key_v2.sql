-- Migration 011, part 11: a sturdier "same address" key (verifier S-1, Nov 17, 2026).
--
-- Part 1's key read a house number only at the very start of the text before the first comma and kept every word
-- after the street suffix, so "4711 Testerly Lane Parker TX", "Home 4711 Testerly Ln", "Unit 3, 4711 Testerly Ln",
-- "4711-A" and "4711A" all escaped the one-per-address check (guest phones are not confirmed, so for a mobile guest
-- the address is the real limit).
--
-- The key is now "<zip>|<house number>|<first street word>":
--   - lower case; a unit (#, apt, apartment, unit, suite, ste and what follows up to the next comma) is left out;
--   - the house number is the first token that is digits with at most one letter ("4711", "4711a"); the letter is
--     left out, so "4711-A", "4711A" and "4711" match;
--   - the street word is the first later word of two or more letters that is not a number or a direction.
-- Null (no address check, phone only) when the ZIP or a house number is missing, e.g. "Apt 4B 4711 ...", which reads
-- the whole text as the unit. Same number and same first street word in one ZIP collide; that fails safe (the
-- regular price).
--
-- The expression index on appointments must be rebuilt after the function changes, or it keeps the old keys.

create or replace function public.address_key(p_address text, p_zip text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  with a as (
    select substring(coalesce(p_zip, '') from '([0-9]{5})') as zip,
           regexp_split_to_array(btrim(regexp_replace(regexp_replace(lower(coalesce(p_address, '')),
             '(#|\m(apt|apartment|unit|suite|ste)\M)[^,]*', ' ', 'g'), '[^a-z0-9]+', ' ', 'g')), ' ') as w
  ), n as (
    select zip, w, (select min(i) from generate_subscripts(w, 1) i where w[i] ~ '^[0-9]+[a-z]?$') as at from a
  )
  select case when zip is null or at is null then null else
    zip || '|' || regexp_replace(w[at], '[a-z]$', '') || '|' || coalesce((
      select w[i] from generate_subscripts(w, 1) i
      where i > at and char_length(w[i]) > 1 and w[i] !~ '^[0-9]+[a-z]?$'
        and w[i] not in ('north','south','east','west','ne','nw','se','sw','northeast','northwest','southeast','southwest')
      order by i limit 1), '') end
  from n
$$;
comment on function public.address_key(text, text) is
  'Match key for "the same street address" (first-time offer, Migration 011 part 11): zip|house number|first street word.';
revoke all on function public.address_key(text, text) from public, anon, authenticated;

reindex index public.appointments_address_key_idx;
