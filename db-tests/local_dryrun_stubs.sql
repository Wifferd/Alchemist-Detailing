-- Extra stand-ins for the local dry run of the test-project script
-- (build/alchemist-test-project-setup.sql). Local only. Loaded after
-- local_supabase_stubs.sql.

-- The marker that identifies the Supabase test project ("Alchemist Test").
create schema alchemist_test_project_marker;

-- Supabase's record of applied migrations (same columns as on the test project).
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text unique,
  rollback text[]
);

-- What the local stand-in for the "http" extension returns: the pinned
-- blocklist file, read from the local clone at the pinned commit.
create schema localstub;
create table localstub.http_content (url text primary key, content text not null);
insert into localstub.http_content (url, content)
values ('https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/'
        || 'db468d422f8e8e1af3d4d67131ab071239d704f7/disposable_email_blocklist.conf',
        pg_read_file('/home/claude/disposable-email-domains/disposable-email-domains/disposable_email_blocklist.conf'));
grant usage on schema localstub to public;
grant select on localstub.http_content to public;
