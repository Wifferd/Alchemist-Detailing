-- Migration 011, part 2: who may read and change the new tables, the audit log, the catalog checks.
--
-- Same rules as the rest of the menu: visitors read what is on sale, signed-in users read like services
-- (active, or everything for the admin), only the admin adds or edits. No removal grant or policy: rows are retired.

alter table public.size_groups enable row level security;
alter table public.service_size_rates enable row level security;
alter table public.addon_allowed_with enable row level security;

revoke all on table public.size_groups, public.service_size_rates, public.addon_allowed_with from public, anon, authenticated;
grant select on table public.size_groups, public.service_size_rates, public.addon_allowed_with to anon, authenticated;
grant insert, update on table public.size_groups, public.service_size_rates, public.addon_allowed_with to authenticated;

create policy "Menu: sizes" on public.size_groups for select to anon, authenticated using (true);
create policy "Admin: add sizes" on public.size_groups for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit sizes" on public.size_groups for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Menu: rates of active services" on public.service_size_rates for select to anon
  using (exists (select 1 from public.services s where s.id = service_id and s.active));
create policy "Menu: rates for signed-in users" on public.service_size_rates for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and s.active) or (select public.is_admin()));
create policy "Admin: add rates" on public.service_size_rates for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit rates" on public.service_size_rates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Menu: add-on limits" on public.addon_allowed_with for select to anon, authenticated using (true);
create policy "Admin: add add-on limits" on public.addon_allowed_with for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edit add-on limits" on public.addon_allowed_with for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Retired "What's the inside like?" answers keep their labels for staff, so old bookings never show a raw code
-- (review S1): managers and detailers could only read active answers until now.
alter policy "Menu: form choices for signed-in users" on public.form_options
  using (active or (select public.is_admin()) or (select public.is_staff()));

-- The audit log, as for the other menu tables (insert and update; rows are never removed).
create trigger size_groups_audit after insert or update on public.size_groups
  for each row execute function public.audit_changes();
create trigger service_size_rates_audit after insert or update on public.service_size_rates
  for each row execute function public.audit_changes();
create trigger addon_allowed_with_audit after insert or update on public.addon_allowed_with
  for each row execute function public.audit_changes();

-- The catalog checks, with branches for the two new link tables.
create or replace function public.check_catalog_links() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  k1 public.service_kind;
  k2 public.service_kind;
  typed boolean;
begin
  if tg_table_name = 'bundle_parts' then
    select s.kind into k1 from public.services s where s.id = new.bundle_id;
    select s.kind into k2 from public.services s where s.id = new.part_id;
    if k1 is distinct from 'bundle' or k2 is null or k2 not in ('exterior', 'interior') then
      perform public.fail('invalid_input', 'A bundle is made of exterior and interior services.');
    end if;
  elsif tg_table_name = 'service_includes' then
    select s.kind into k1 from public.services s where s.id = new.service_id;
    select s.kind into k2 from public.services s where s.id = new.included_id;
    if k1 is null or k1 = 'addon' or k2 is distinct from 'addon' then
      perform public.fail('invalid_input', 'Only a main service or bundle can include an add-on.');
    end if;
  elsif tg_table_name = 'addon_rules' then
    select s.kind into k1 from public.services s where s.id = new.addon_id;
    if k1 is distinct from 'addon' then
      perform public.fail('invalid_input', 'Rules like this are for add-ons only.');
    end if;
  elsif tg_table_name = 'service_type_prices' then
    select s.priced_by_vehicle_type into typed from public.services s where s.id = new.service_id;
    if not coalesce(typed, false) then
      perform public.fail('invalid_input', 'This service has one price for every vehicle.');
    end if;
  elsif tg_table_name = 'service_size_rates' then
    select s.priced_by_size into typed from public.services s where s.id = new.service_id;
    if not coalesce(typed, false) then
      perform public.fail('invalid_input', 'This service isn''t priced by size.');
    end if;
  elsif tg_table_name = 'addon_allowed_with' then
    select s.kind into k1 from public.services s where s.id = new.addon_id;
    select s.kind into k2 from public.services s where s.id = new.service_id;
    if k1 is distinct from 'addon' or k2 is null or k2 = 'addon' then
      perform public.fail('invalid_input', 'An add-on can be limited to main services or bundles only.');
    end if;
  end if;
  return new;
end
$$;

create trigger service_size_rates_check before insert or update on public.service_size_rates
  for each row execute function public.check_catalog_links();
create trigger addon_allowed_with_check before insert or update on public.addon_allowed_with
  for each row execute function public.check_catalog_links();

-- business_settings is readable by column since Migration 008 (the owner's address stays closed), and its row only by
-- the manager and the admin (policy "Managers: read settings"). The new settings get the same column grant, for the
-- admin's Settings and Morning view; visitors and customers get the offer through get_first_visit_offer().
grant select (first_visit_offer_ends_on, first_visit_popup_days, visit_overhead_min)
  on public.business_settings to authenticated;
