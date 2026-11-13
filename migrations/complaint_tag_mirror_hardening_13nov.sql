-- Complaint tag mirror hardening (Kate, 13 Nov 2026). Follows complaint_tag_mirror_13nov.sql.
-- 1. complaint_tag_queue as it runs live (the first file has the older body: this is the version with
--    #variable_conflict use_column and a stable order, needed because the API returns 1000 rows per page).
-- 2. complaint_tag_desired also reads client_phone, so a complaint logged on the form (phone typed, no Phorest
--    match yet) is counted. Before this the mirror REMOVED tags that the 12 Nov backfill had put on those clients.
-- 3. internal_secrets: a service-role-only table for shared secrets. The cron job for complaint-tag-sync sends
--    the value in the header x-cron-secret and the function refuses a call without it. The public anon key alone
--    no longer lets anyone run the function. No secret value is stored in this file.
-- No names or numbers anywhere in this file.

create table if not exists public.internal_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.internal_secrets enable row level security;
revoke all on public.internal_secrets from anon, authenticated;

-- creates the secret once, never overwrites it
insert into public.internal_secrets(name, value)
select 'complaint_tag_sync_cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.internal_secrets where name = 'complaint_tag_sync_cron');

create or replace function public.complaint_tag_desired()
returns table(phone text, confirmed_n int, pending boolean, tags text[])
language sql security definer set search_path = public as $$
  with pe as (
    select distinct phorest_id, mobile_norm from phorest_client_emails
    where mobile_norm is not null and mobile_norm <> ''
  ), cp as (
    -- the phone of a complaint: Phorest first, else the phone typed on the form
    select c.id, coalesce(pe.mobile_norm, nullif(btrim(c.client_phone), '')) as ph
    from client_complaints c left join pe on pe.phorest_id = c.phorest_id
    where c.is_complaint and c.duplicate_of is null
  ), cc as (
    select ph, count(distinct id)::int as n from cp where ph is not null group by 1
  ), cand as (
    select phone as ph,
           count(*) filter (where status = 'confirmed')::int as n,
           bool_or(status in ('todo', 'unsure')) as pend
    from complaint_candidates where phone is not null group by 1
  ), allp as (
    select ph from cc union select ph from cand
  ), x as (
    select a.ph,
           coalesce(cc.n, 0) + coalesce(cand.n, 0) as n,
           coalesce(cand.pend, false) as pend
    from allp a left join cc on cc.ph = a.ph left join cand on cand.ph = a.ph
  )
  select x.ph, x.n, x.pend,
         array_remove(array[
           case when x.pend then 'possible-complaint' end,
           case when x.n >= 1 then 'complaint-confirmed' end,
           case when x.n >= 2 then 'complaint-repeat' end,
           case when x.n >= 3 then 'complaint-3plus' end
         ], null)
  from x
  where not exists (select 1 from staff_phones s where s.phone = x.ph);
$$;
revoke all on function public.complaint_tag_desired() from public, anon, authenticated;

create or replace function public.complaint_tag_queue(p_full boolean default false)
returns table(phone text, contact_id bigint, desired text[], synced text[])
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  insert into complaint_tag_mirror as m0 (phone, desired)
    select d.phone, d.tags from complaint_tag_desired() d
  on conflict on constraint complaint_tag_mirror_pkey do update set desired = excluded.desired, updated_at = now()
    where m0.desired is distinct from excluded.desired;
  update complaint_tag_mirror m set desired = '{}', updated_at = now()
    where m.desired <> '{}' and not exists (select 1 from complaint_tag_desired() d where d.phone = m.phone);
  return query
    select m.phone, m.contact_id, m.desired, m.synced from complaint_tag_mirror m
    where p_full or m.synced is null or m.synced is distinct from m.desired
    order by m.phone;
end $$;
revoke all on function public.complaint_tag_queue(boolean) from public, anon, authenticated;

-- Cron job 44 (applied separately, never stores the secret itself, it reads it at run time):
--   select cron.alter_job(44, command := $c$
--     select net.http_post(
--       url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/complaint-tag-sync',
--       headers := jsonb_build_object('Content-Type','application/json',
--         'Authorization','Bearer <the project anon key, needed by the JWT gateway>',
--         'x-cron-secret',(select value from public.internal_secrets where name='complaint_tag_sync_cron')),
--       body := '{"live":true,"budget_s":55}'::jsonb, timeout_milliseconds := 90000) $c$);
