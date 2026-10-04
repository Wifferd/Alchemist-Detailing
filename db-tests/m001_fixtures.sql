-- Test logins, created the way Supabase Auth creates them (rows in auth.users).
-- Phone numbers are stored like Supabase does: 1 + 10 digits, no plus sign.
reset role;

insert into auth.users (id, aud, role, phone, phone_confirmed_at, email, email_confirmed_at, raw_user_meta_data, is_anonymous)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', '19455552001', now(), 'ada.owner@gmail.com', now(), '{"first_name":"Ada","last_name":"Owner"}', false),
  ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', '19455552002', now(), null, null, '{"first_name":"Morgan","last_name":"Lee"}', false),
  ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', '19455552003', now(), null, null, '{"first_name":"Dana"}', false),
  ('00000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', '19455552004', now(), null, null, '{"first_name":"Drew"}', false),
  ('00000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', '19725552011', now(), 'carla.diaz@gmail.com', now(), '{"first_name":"Carla","last_name":"Diaz"}', false),
  ('00000000-0000-4000-8000-0000000000d2', 'authenticated', 'authenticated', '19725552012', now(), 'ben@outlook.com', null, '{"first_name":"Ben","last_name":"O''Neil"}', false),
  ('00000000-0000-4000-8000-0000000000d3', 'authenticated', 'authenticated', '14695552013', now(), null, null, null, false),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', '12145552021', now(), null, null, '{"first_name":"Cora","last_name":"Nguyễn"}', false),
  ('00000000-0000-4000-8000-0000000000d5', 'authenticated', 'authenticated', '12145552022', now(), null, null, '{"first_name":"Eli","last_name":"St. John"}', false),
  ('00000000-0000-4000-8000-0000000000d6', 'authenticated', 'authenticated', '12145552023', now(), null, null, '{"first_name":"Faye","last_name":"Mary-Jane"}', false),
  ('00000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', '14695552014', null, null, null, '{"first_name":"Uma"}', false),
  ('00000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', null, null, null, null, null, true),
  ('00000000-0000-4000-8000-0000000000e3', 'authenticated', 'authenticated', '14695552016', now(), null, null, '{"first_name":"Ivy"}', false),
  ('00000000-0000-4000-8000-0000000000e4', 'authenticated', 'authenticated', '14695552017', now(), null, null, '{"first_name":"asdfgh","last_name":"Fuckface"}', false),
  ('00000000-0000-4000-8000-0000000000e5', 'authenticated', 'authenticated', '14695552018', now(), 'temp@mailinator.com', now(), '{"first_name":"Tom"}', false);

-- Profiles copy phone and email only once confirmed; junk names are dropped.
select tst.eq((select count(*)::text from public.profiles), '15', 'fixtures: a profile for every login');
select tst.ok((select first_name = 'Cora' and last_name = 'Nguyễn' from public.profiles where id = '00000000-0000-4000-8000-0000000000d4'), 'auth sync: accented names kept');
select tst.ok((select last_name = 'St. John' from public.profiles where id = '00000000-0000-4000-8000-0000000000d5'), 'auth sync: names with periods and spaces kept');
select tst.eq((select phone from public.profiles where id = '00000000-0000-4000-8000-0000000000d1'), '19725552011', 'auth sync: confirmed phone copied');
select tst.eq((select email from public.profiles where id = '00000000-0000-4000-8000-0000000000d1'), 'carla.diaz@gmail.com', 'auth sync: confirmed email copied');
select tst.ok((select email is null from public.profiles where id = '00000000-0000-4000-8000-0000000000d2'), 'auth sync: unconfirmed email not copied');
select tst.ok((select phone is null from public.profiles where id = '00000000-0000-4000-8000-0000000000e1'), 'auth sync: unconfirmed phone not copied');
select tst.ok((select first_name is null and last_name is null from public.profiles where id = '00000000-0000-4000-8000-0000000000e4'), 'auth sync: junk and profane names dropped');
select tst.ok((select email is null from public.profiles where id = '00000000-0000-4000-8000-0000000000e5'), 'auth sync: throwaway email not copied');
select tst.eq((select last_name from public.profiles where id = '00000000-0000-4000-8000-0000000000d2'), 'O''Neil', 'auth sync: apostrophe name kept');
select tst.ok((select bool_and(role = 'customer') from public.profiles), 'auth sync: every login starts as a customer');

-- Later confirmation is synced.
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000d2';
select tst.eq((select email from public.profiles where id = '00000000-0000-4000-8000-0000000000d2'), 'ben@outlook.com', 'auth sync: email copied once confirmed later');
update auth.users set phone = '14695559999' where id = '00000000-0000-4000-8000-0000000000e1';
select tst.ok((select phone is null from public.profiles where id = '00000000-0000-4000-8000-0000000000e1'), 'auth sync: changed but unconfirmed phone still not copied');
update auth.users set phone = '14695552014' where id = '00000000-0000-4000-8000-0000000000e1';

-- Owner setup, run once from the SQL editor.
select tst.err($q$select public.bootstrap_admin('555-0100')$q$, 'invalid_input', 'bootstrap: fake number refused');
select tst.err($q$select public.bootstrap_admin('(214) 555-7777')$q$, 'not_found', 'bootstrap: unknown number refused');
select tst.eq(public.bootstrap_admin('(945) 555-2001')::text, '00000000-0000-4000-8000-0000000000a1', 'bootstrap: owner becomes admin');
select tst.err($q$select public.bootstrap_admin('(945) 555-2002')$q$, 'wrong_state', 'bootstrap: only once');

-- The admin (with the authenticator step) sets up the team.
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.eq((public.set_user_role('00000000-0000-4000-8000-0000000000b1', 'manager')).role::text, 'manager', 'admin: makes a manager');
select tst.eq((public.set_user_role('00000000-0000-4000-8000-0000000000c1', 'detailer')).role::text, 'detailer', 'admin: makes a detailer');
select tst.eq((public.set_user_role('00000000-0000-4000-8000-0000000000c2', 'detailer')).role::text, 'detailer', 'admin: makes a second detailer');
select tst.ok(not (public.set_user_active('00000000-0000-4000-8000-0000000000e3', false)).is_active, 'admin: turns an account off');
reset role;
