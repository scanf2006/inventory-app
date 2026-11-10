-- Main trigger for the daily Bulk Oil email.
--
-- Supabase starts the GitHub workflow at 21:30, 22:30 and 23:30 UTC on weekdays
-- (5:30 PM Toronto is 21:30 UTC in summer and 22:30 UTC in winter). The workflow
-- itself decides whether to send: once per day, from 5:30 PM Toronto, not on
-- holidays, only when Bulk Oil changed.
--
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Replace PASTE_GITHUB_TOKEN_HERE with the GitHub token first (see docs/daily-report.md).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the GitHub token encrypted in Supabase Vault. Running this again with a
-- new token replaces the old one.
do $$
declare
  token text := 'PASTE_GITHUB_TOKEN_HERE';
  existing uuid;
begin
  if token like 'PASTE%' then
    raise exception 'Replace PASTE_GITHUB_TOKEN_HERE with your GitHub token first';
  end if;
  select id into existing from vault.secrets where name = 'github_report_token';
  if existing is null then
    perform vault.create_secret(token, 'github_report_token', 'Starts the daily Bulk Oil email workflow');
  else
    perform vault.update_secret(existing, token);
  end if;
end $$;

-- Starts the workflow; mode 'scheduled' = normal daily run, 'preview' = build only (for testing)
create or replace function public.start_bulk_oil_report(mode text default 'scheduled')
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := 'https://api.github.com/repos/scanf2006/inventory-app/actions/workflows/daily-bulk-oil-report.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_report_token'),
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'waycred-inventory-report'
    ),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('mode', mode))
  );
$$;

-- Only the database itself may call it (not the public app key)
revoke all on function public.start_bulk_oil_report(text) from public, anon, authenticated;

-- Weekdays at 21:30, 22:30 and 23:30 UTC
select cron.schedule('daily-bulk-oil-report', '30 21,22,23 * * 1-5', $$select public.start_bulk_oil_report('scheduled')$$);
