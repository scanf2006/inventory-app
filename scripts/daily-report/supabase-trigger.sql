-- Main trigger for the daily Bulk Oil email.
--
-- Supabase starts the GitHub workflow at 23:00 UTC (Mon-Fri) and 00:00 and
-- 01:00 UTC (Tue-Sat). 7:00 PM Toronto is 23:00 UTC in summer and 00:00 UTC the
-- next day in winter; the other runs are backups. The workflow itself decides
-- whether to send: once per day, from 7:00 PM Toronto, not on holidays, only when
-- Bulk Oil changed.
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

-- Toronto weekday evenings: 23:00 UTC Mon-Fri, plus 00:00 and 01:00 UTC Tue-Sat
select cron.unschedule(jobname) from cron.job where jobname like 'daily-bulk-oil-report%';
select cron.schedule('daily-bulk-oil-report-a', '0 23 * * 1-5', $$select public.start_bulk_oil_report('scheduled')$$);
select cron.schedule('daily-bulk-oil-report-b', '0 0,1 * * 2-6', $$select public.start_bulk_oil_report('scheduled')$$);
