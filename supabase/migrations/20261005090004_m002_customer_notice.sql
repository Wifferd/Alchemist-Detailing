-- Migration 002, part 4: a note from the owner shown on the booking calendar (doc 27).
-- Display only; blocked days are a separate thing (blocked_days). The admin edits it
-- through the existing "Admin: edit settings" policy.
alter table public.business_settings
  add column customer_notice text check (customer_notice is null or char_length(customer_notice) <= 300);
comment on column public.business_settings.customer_notice is
  'Shown to customers on the booking calendar, as a note from the owner. Empty hides it.';

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
    'customer_notice', s.customer_notice)
  from public.business_settings s
  where s.id = 1
$$;
