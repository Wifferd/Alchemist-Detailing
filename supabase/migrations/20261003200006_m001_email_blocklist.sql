-- Alchemist Detailing — Migration 001, file 6 of 6: throwaway-email blocklist
--
-- Loads the public disposable-email-domains list (CC0 public domain,
-- github.com/disposable-email-domains/disposable-email-domains), pinned to
-- commit db468d4 of Oct 3, 2026: 9,203 domains. The database downloads the
-- pinned file itself over HTTPS, checks it is exactly the expected list (count
-- and fingerprint), saves it, and removes the download tool again. If the
-- download fails or the list differs, nothing is saved.
-- The admin can add or remove domains later in the blocked_email_domains table.
do $$
declare
  had_http boolean := exists (select 1 from pg_catalog.pg_extension where extname = 'http');
  v_status int;
  v_body text;
  v_domains text[];
  v_md5 text;
begin
  if not had_http then
    create extension http with schema extensions;
  end if;

  select r.status, r.content
    into v_status, v_body
  from extensions.http_get('https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/'
                           || 'db468d422f8e8e1af3d4d67131ab071239d704f7/disposable_email_blocklist.conf') as r;
  if v_status is distinct from 200 or v_body is null then
    raise exception 'Could not download the blocklist (HTTP %).', v_status;
  end if;

  select array_agg(d order by d collate "C")
    into v_domains
  from (select distinct lower(btrim(x)) as d
        from regexp_split_to_table(v_body, E'\n') as x
        where btrim(x) <> '') as t;
  v_md5 := md5(array_to_string(v_domains, E'\n') || E'\n');
  if cardinality(v_domains) <> 9203 or v_md5 <> '864fde06075677831c383c567ddea098' then
    raise exception 'The blocklist is not the expected one (% domains, fingerprint %).', cardinality(v_domains), v_md5;
  end if;

  insert into public.blocked_email_domains (domain)
  select unnest(v_domains)
  on conflict do nothing;

  if not had_http then
    drop extension http;
  end if;
end
$$;
