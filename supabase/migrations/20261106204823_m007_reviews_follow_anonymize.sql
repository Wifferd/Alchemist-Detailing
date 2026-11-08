-- Test project: Nov 6, 2026 (version 20261106204823). Live: Nov 7, 2026 (version 20261107043010), the owner's answer 4 (doc 46).
-- Migration 007, part 6: a booking whose personal details are removed takes its review off the Reviews page.
--
-- anonymize_customer and anonymize_booking (Migration 001) came before the reviews table (Migration 002) and
-- never touch it, so an approved review kept the customer's first name and last initial on the public page.
-- A trigger on the booking covers both (anonymize_customer scrubs every booking of the customer) and replaces
-- no function: when a booking's anonymized_at is first set, its review is hidden and its name becomes
-- "A customer". PROPOSED for the owner: hiding it (this) or keeping the words public as "A customer".
-- The reviews of bookings anonymized before this migration are brought in line the same way.
create or replace function public.hide_review_of_anonymized_booking()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.reviews r
     set status = 'hidden', display_name = 'A customer', updated_at = now()
   where r.appointment_id = new.id
     and (r.status <> 'hidden' or r.display_name <> 'A customer');
  return null;
end
$$;
comment on function public.hide_review_of_anonymized_booking() is
  'Trigger: a booking anonymized (anonymized_at set) hides its review and takes the customer''s name off it (Migration 007).';
revoke all on function public.hide_review_of_anonymized_booking() from public, anon, authenticated;

create or replace trigger appointments_hide_review
  after update of anonymized_at on public.appointments
  for each row
  when (old.anonymized_at is null and new.anonymized_at is not null)
  execute function public.hide_review_of_anonymized_booking();

update public.reviews r
   set status = 'hidden', display_name = 'A customer', updated_at = now()
  from public.appointments a
 where a.id = r.appointment_id and a.anonymized_at is not null
   and (r.status <> 'hidden' or r.display_name <> 'A customer');
