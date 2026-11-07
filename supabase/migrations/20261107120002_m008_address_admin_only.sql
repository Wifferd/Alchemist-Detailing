-- Test project: Nov 7, 2026 (version 20261107031054). Live: Nov 7, 2026 (version 20261107043038), after the page (doc 46).
-- For live, the order mattered: push the page
-- first, check that both Vercel projects serve the new commit (its admin.js asks shop_address_on_file()), then apply
-- this part, and part 3 with it. The page on main at 4af98d6 filters on the address column: once this part is on, that
-- request is refused, and its Settings screen would tell the owner "Your address: Not set".
-- Migration 008, part 2 (Nov 7, 2026; the owner's answer 5 to doc 45, "Yes to all"):
-- the owner's home address (business_settings.shop_address) is private (house rule 6). Migration 001 let every
-- signed-in reader of the settings row (managers and the admin, by the "Managers: read settings" rule) select it
-- through the API. Now no API role reads that column: the table-wide SELECT becomes a SELECT on every other column.
-- The address still reaches a customer on their own confirmed "Come to us" booking (my_bookings runs as the owner;
-- part 3 keeps it from a manager's own booking),
-- the owner still sets it in the SQL Editor, and the Admin page asks shop_address_on_file() whether one is on file.
-- UPDATE stays as it is (the admin saves customer_notice and google_reviews_url; RLS keeps managers out).
-- A column added to business_settings later needs its own "grant select (column)" to be readable by staff.
do $$
begin
  if (select array_agg(column_name::text order by column_name) from information_schema.columns
      where table_schema = 'public' and table_name = 'business_settings' and column_name <> 'shop_address')
     is distinct from array['customer_notice', 'first_start_min', 'google_reviews_url', 'guest_booking', 'hold_hours', 'id',
       'last_start_min', 'latest_end_min', 'max_days_ahead', 'max_mobile_jobs', 'max_mobile_jobs_per_person',
       'max_open_requests_per_customer', 'max_requests_per_customer_per_day', 'max_shop_jobs', 'max_shop_jobs_per_person',
       'min_days_ahead', 'mobile_buffer_min', 'mobile_note', 'mobile_radius_miles', 'public_area', 'public_phone',
       'repeat_window_min', 'require_mfa_for_managers', 'shop_and_mobile_together', 'shop_buffer_min', 'slot_step_min',
       'timezone', 'updated_at'] then
    raise exception 'business_settings has other columns than Migration 008 expects: stopped, nothing changed';
  end if;
end
$$;

revoke select on table public.business_settings from authenticated, anon;
grant select (id, timezone, first_start_min, last_start_min, latest_end_min, slot_step_min, min_days_ahead,
              max_days_ahead, hold_hours, max_shop_jobs, max_mobile_jobs, shop_and_mobile_together,
              max_shop_jobs_per_person, max_mobile_jobs_per_person, shop_buffer_min, mobile_buffer_min,
              max_open_requests_per_customer, max_requests_per_customer_per_day, repeat_window_min,
              require_mfa_for_managers, public_phone, public_area, mobile_radius_miles, mobile_note, updated_at,
              customer_notice, google_reviews_url, guest_booking)
  on table public.business_settings to authenticated;

-- For the Admin page's Settings screen: is an address on file? Yes or no, never the address. The admin only.
create or replace function public.shop_address_on_file() returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return exists (select 1 from public.business_settings s
                 where s.id = 1 and nullif(btrim(s.shop_address), '') is not null);
end
$$;
comment on function public.shop_address_on_file() is
  'True when the owner''s private address is on file (business_settings.shop_address), never the address itself. The admin only (Migration 008).';
revoke all on function public.shop_address_on_file() from public, anon;
grant execute on function public.shop_address_on_file() to authenticated;
