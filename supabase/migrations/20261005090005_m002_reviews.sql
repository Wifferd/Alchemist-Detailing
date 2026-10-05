-- Migration 002, part 5: customer reviews (doc 29, Q-R1 to Q-R5, all as recommended).
--   * Only a real customer, for their own completed booking, one review per booking.
--   * Nothing shows until the owner approves it; the owner can hide it again.
--   * The owner can reply publicly.
--   * Shown as first name and last initial only ("Carla D.").
--   * A review of a $200+ booking is gold (doc 22).
--   * business_settings.google_reviews_url: a link to Google reviews, shown when set.

create type public.review_status as enum ('pending', 'approved', 'hidden');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 1000),
  status public.review_status not null default 'pending',
  is_gold boolean not null default false,
  display_name text not null check (char_length(display_name) between 1 and 60),
  owner_reply text check (owner_reply is null or char_length(owner_reply) <= 1000),
  replied_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_status_idx on public.reviews (status, created_at desc);
create index reviews_user_idx on public.reviews (user_id);
comment on table public.reviews is 'Customer reviews, one per completed booking. Public only once approved.';

alter table public.reviews enable row level security;
grant select on public.reviews to authenticated;
create policy "Reviews: own, or managers" on public.reviews
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_manager()));
-- Visitors read approved reviews through public_reviews() only.

alter table public.business_settings
  add column google_reviews_url text check (google_reviews_url is null or (char_length(google_reviews_url) <= 300 and google_reviews_url ~ '^https://'));

create or replace function public.get_public_settings() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'timezone', s.timezone,
    'first_start_min', s.first_start_min,
    'last_start_min', s.last_start_min,
    'latest_end_min', s.latest_end_min,
    'slot_step_min', s.slot_step_min,
    'min_days_ahead', s.min_days_ahead,
    'max_days_ahead', s.max_days_ahead,
    'hold_hours', s.hold_hours,
    'public_phone', s.public_phone,
    'public_area', s.public_area,
    'mobile_radius_miles', s.mobile_radius_miles,
    'mobile_note', s.mobile_note,
    'customer_notice', s.customer_notice,
    'google_reviews_url', s.google_reviews_url)
  from public.business_settings s
  where s.id = 1
$$;

-- "Carla D." from the profile; falls back to the booking's contact name.
create function public.review_display_name(p_user uuid, p_appointment uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select nullif(btrim(coalesce(p.first_name, '')), '') || coalesce(' ' || left(btrim(p.last_name), 1) || '.', '')
       from public.profiles p where p.id = p_user and nullif(btrim(coalesce(p.first_name, '')), '') is not null),
    (select nullif(btrim(coalesce(a.contact_first, '')), '') || coalesce(' ' || left(btrim(a.contact_last), 1) || '.', '')
       from public.appointments a where a.id = p_appointment),
    'A customer')
$$;

-- A customer writes a review of their own completed booking.
create function public.submit_review(p_appointment uuid, p_rating int, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a public.appointments;
  v text := nullif(btrim(coalesce(p_body, '')), '');
  r public.reviews;
begin
  perform public.assert_signed_in();
  select * into a from public.appointments x where x.id = p_appointment and x.customer_id = auth.uid() and x.anonymized_at is null;
  if not found then
    perform public.fail('not_found', 'That booking wasn''t found.', 'appointment');
  end if;
  if a.status <> 'completed' then
    perform public.fail('wrong_state', 'You can review a detail once it''s done.', 'appointment');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    perform public.fail('invalid_input', 'Choose 1 to 5 stars.', 'rating');
  end if;
  if v is null or char_length(v) > 1000 or not public.is_clean_text(v) then
    perform public.fail('invalid_input', 'Write a few words (under 1,000 characters, no links).', 'body');
  end if;
  if exists (select 1 from public.reviews x where x.appointment_id = a.id) then
    perform public.fail('wrong_state', 'You''ve already reviewed this detail. Thank you!', 'appointment');
  end if;
  insert into public.reviews (appointment_id, user_id, rating, body, is_gold, display_name)
  values (a.id, auth.uid(), p_rating, v, coalesce(a.total_cents, 0) >= 20000, public.review_display_name(auth.uid(), a.id))
  returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status, 'is_gold', r.is_gold, 'display_name', r.display_name);
end
$$;

-- Approved reviews for everyone, newest first.
create function public.public_reviews(p_limit int default 50) returns setof jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
           'id', r.id, 'name', r.display_name, 'rating', r.rating, 'body', r.body, 'is_gold', r.is_gold,
           'reply', r.owner_reply, 'replied_at', r.replied_at, 'created_at', r.created_at,
           'services', (select string_agg(i.name, ' + ' order by i.sort) from public.appointment_items i
                        where i.appointment_id = r.appointment_id and not i.included and i.code not like 'cond\_%'))
  from public.reviews r
  where r.status = 'approved'
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- The owner (or a manager) approves or hides, and replies.
create function public.review_set_status(p_id uuid, p_status text) returns public.reviews
language plpgsql volatile security definer set search_path = ''
as $$
declare r public.reviews;
begin
  perform public.assert_manager();
  if p_status is null or p_status not in ('approved', 'hidden', 'pending') then
    perform public.fail('invalid_input', 'Choose approved, hidden or pending.', 'status');
  end if;
  update public.reviews x
     set status = p_status::public.review_status, decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where x.id = p_id
  returning * into r;
  if not found then
    perform public.fail('not_found', 'That review wasn''t found.');
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, new_value)
  values (auth.uid(), 'review_' || p_status, 'review', p_id::text, jsonb_build_object('status', p_status));
  return r;
end
$$;

create function public.review_reply(p_id uuid, p_reply text) returns public.reviews
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_reply, '')), '');
  r public.reviews;
begin
  perform public.assert_manager();
  if v is not null and (char_length(v) > 1000 or not public.is_clean_text(v)) then
    perform public.fail('invalid_input', 'Keep the reply under 1,000 characters, with no links.', 'reply');
  end if;
  update public.reviews x
     set owner_reply = v, replied_at = case when v is null then null else now() end, updated_at = now()
   where x.id = p_id
  returning * into r;
  if not found then
    perform public.fail('not_found', 'That review wasn''t found.');
  end if;
  return r;
end
$$;

revoke all on function public.submit_review(uuid, int, text) from public;
revoke all on function public.public_reviews(int) from public;
revoke all on function public.review_set_status(uuid, text) from public;
revoke all on function public.review_reply(uuid, text) from public;
revoke all on function public.review_display_name(uuid, uuid) from public;
grant execute on function public.submit_review(uuid, int, text) to authenticated;
grant execute on function public.public_reviews(int) to anon, authenticated;
grant execute on function public.review_set_status(uuid, text) to authenticated;
grant execute on function public.review_reply(uuid, text) to authenticated;
