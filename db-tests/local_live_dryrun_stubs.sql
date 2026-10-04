-- Extra stand-ins for the local dry run of the live-project script
-- (build/alchemist-live-project-setup.sql). Local only. Loaded after
-- local_supabase_stubs.sql. Like a fresh Supabase project: no migration
-- records yet, plus the one-time marker created on the live project.
create schema alchemist_production_marker;

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
