-- Migration 010, part 2: real names that contain "qaz" are no longer refused.
--
-- Why: the owner, Nov 12: "fix all problems". The review of the site's name check (doc 53) found that
-- public.is_valid_name's keyboard-run rule refuses the run "qaz" anywhere in a name, which turns away real names such
-- as Qazi, Qazim and Qazaq. The other runs (asdf, qwer, zxcv, wsx...) stay: no real name was found that contains them.
-- The site's own copy of the rule (site/js/data.js NAME_KEYS) changes with it, after this is applied.
-- The function keeps its name and arguments; it only lets through more names, so no stored name becomes invalid.
--
-- Test project: 2026-11-12. Live: 2026-11-12.

create or replace function public.is_valid_name(t text) returns boolean
language sql immutable set search_path = ''
as $$
  select t is not null
     and char_length(btrim(t)) between 1 and 40
     and btrim(t) ~ '^[[:alpha:]]([[:alpha:]''’ .-]*[[:alpha:].])?$'
     and lower(btrim(t)) !~ '(.)\1\1'
     and lower(t) !~ '(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|zxcv|xcvb|cvbn|vbnm|uiop|wsx)'
     and lower(btrim(t)) not in ('test', 'testing', 'tester', 'fake', 'fakename', 'none', 'null', 'unknown',
                                 'anonymous', 'idk', 'xxx', 'asdf', 'qwerty', 'name', 'firstname', 'lastname',
                                 'first', 'last', 'abc', 'blah', 'nobody', 'customer', 'user')
     and not public.has_profanity(t)
$$;
