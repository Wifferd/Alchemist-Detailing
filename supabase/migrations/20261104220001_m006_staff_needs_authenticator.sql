-- Alchemist Detailing — Migration 006: managers and the admin need their authenticator code for team reads too (doc 43).
--
-- Until now is_staff() checked the role only. So a manager or the admin signed in with the first step alone
-- (aal1) could still read the bookings assigned to them (with the customer's contact details and address), their
-- photos, open_jobs and their own notices, and use request_job, withdraw_job_request and request_review. With
-- the Admin page's email-and-password sign-in (doc 43) that first step is a password, so these now need the
-- authenticator code as well, like every manager and admin power already did (is_manager, is_admin).
-- Detailers are unchanged: they have no authenticator step.
--
-- Plain replacements: the grants on these functions and the policies that call them stay as they are.

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() = 'detailer'
                  or (public.app_role() in ('manager', 'admin') and public.mfa_ok()), false)
$$;
comment on function public.is_staff() is 'True for detailers, and for managers and the admin after their authenticator code (Migration 006).';

create or replace function public.assert_staff() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_signed_in();
  if public.app_role() in ('manager', 'admin') and not public.mfa_ok() then
    perform public.fail('mfa_required', 'Enter the code from your authenticator app to continue.');
  end if;
  if not public.is_staff() then
    perform public.fail('not_allowed', 'This is for team members only.');
  end if;
end
$$;

-- A manager's or the admin's own notices name new requests and their dates: after the authenticator code too.
-- Customers and detailers read theirs as before.
alter policy "Notices: read own" on public.notifications
  using (recipient_id = (select auth.uid())
         and (coalesce((select public.app_role()) not in ('manager', 'admin'), true) or (select public.mfa_ok())));
alter policy "Notices: mark own as read" on public.notifications
  using (recipient_id = (select auth.uid())
         and (coalesce((select public.app_role()) not in ('manager', 'admin'), true) or (select public.mfa_ok())))
  with check (recipient_id = (select auth.uid()));
