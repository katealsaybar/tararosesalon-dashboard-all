-- Client Book auto-sync, no laptop (Kate, 19 Nov 2026).
-- The edge function client-contacts-sync pulls client contacts + card notes from the Phorest API for UAE and Bahrain,
-- then calls client_contacts_reconcile(), which tidies the pulled rows and runs client_contacts_sync() (the same
-- reconcile that daily-reports Step 13 runs by hand). Source of the function: supabase/functions/client-contacts-sync/index.ts.

create table if not exists public.client_contacts_pull_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  source text,                -- 'cron-2h', 'cron-night', 'manual'
  days int,
  uae_pulled int,
  bah_pulled int,
  notes_written int,
  notes_cleared int,
  branches_added int,
  result jsonb,               -- counts only, never names or numbers
  error text
);
alter table public.client_contacts_pull_log enable row level security;
revoke all on public.client_contacts_pull_log from anon, authenticated;

create or replace function public.client_contacts_reconcile(p_days int default 14)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
declare
  n_key int; n_status int; sync jsonb;
begin
  -- name key for ids that arrived new (UAE name-keyed contacts use it)
  update phorest_client_emails
     set name_key = stl_client_key(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')))
   where branch = 'UAE' and name_key is null and coalesce(first_name, '') || coalesce(last_name, '') <> '';
  get diagnostics n_key = row_count;

  -- email status for rows pulled in the last two days: an email on 5 or more clients of a business is a placeholder
  with fresh as (
    select branch, phorest_id from phorest_client_emails where pulled_at >= current_date - 1
  ), shared as (
    select e.branch, e.email from phorest_client_emails e
    where e.email is not null and e.email <> '' group by 1, 2 having count(*) >= 5
  ), calc as (
    select e.branch, e.phorest_id,
           case when coalesce(e.email, '') = '' then 'no email'
                when exists (select 1 from shared s where s.branch = e.branch and s.email = e.email) then 'placeholder (shared by 5+ clients)'
                else 'real' end as st
    from phorest_client_emails e join fresh f on f.branch = e.branch and f.phorest_id = e.phorest_id
  )
  update phorest_client_emails e set email_status = c.st
    from calc c
   where e.branch = c.branch and e.phorest_id = c.phorest_id and e.email_status is distinct from c.st;
  get diagnostics n_status = row_count;

  -- the existing reconcile (UAE contacts keyed by name -> Phorest id)
  sync := public.client_contacts_sync(p_days, false, false);
  return jsonb_build_object('name_keys_filled', n_key, 'email_status_fixed', n_status, 'sync', sync);
end;
$$;
revoke all on function public.client_contacts_reconcile(int) from public, anon, authenticated;
grant execute on function public.client_contacts_reconcile(int) to service_role;
