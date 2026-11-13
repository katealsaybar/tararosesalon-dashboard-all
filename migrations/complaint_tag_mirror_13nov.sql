-- Complaint tag mirror (Kate, 13 Nov 2026): the dashboard is the source of truth, respond.io is a one-way mirror.
-- Four tags only, nothing else on a contact is ever touched:
--   possible-complaint : a chat candidate for this phone is still todo or unsure
--   complaint-confirmed: 1 or more confirmed complaints
--   complaint-repeat   : 2 or more
--   complaint-3plus    : 3 or more
-- A confirmed complaint is a client_complaints row (is_complaint, not a duplicate) matched to a phone through
-- phorest_client_emails, plus a chat candidate with status 'confirmed'. 'already' and 'not' never count.
-- Staff phones (staff_phones.phone) are excluded. Numbers or names are never stored in the repo.

create table if not exists public.complaint_tag_mirror (
  phone text primary key,
  contact_id bigint,
  desired text[] not null default '{}',
  synced text[],
  synced_at timestamptz,
  status text,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.complaint_tag_mirror enable row level security;
revoke all on public.complaint_tag_mirror from anon, authenticated;

create or replace function public.complaint_tag_desired()
returns table(phone text, confirmed_n int, pending boolean, tags text[])
language sql security definer set search_path = public as $$
  with cc as (
    select p.mobile_norm as ph, count(*)::int as n
    from client_complaints c
    join (select distinct phorest_id, mobile_norm from phorest_client_emails
          where mobile_norm is not null and mobile_norm <> '') p on p.phorest_id = c.phorest_id
    where c.is_complaint and c.duplicate_of is null
    group by 1
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

-- Queue: rows whose desired tags changed since they were last confirmed on the contact.
-- Anyone no longer in the desired list (phone with no complaint any more) gets an empty desired set, so the tags come off.
create or replace function public.complaint_tag_queue(p_full boolean default false)
returns table(phone text, contact_id bigint, desired text[], synced text[])
language plpgsql security definer set search_path = public as $$
begin
  insert into complaint_tag_mirror(phone, desired)
    select d.phone, d.tags from complaint_tag_desired() d
  on conflict (phone) do update set desired = excluded.desired, updated_at = now()
    where complaint_tag_mirror.desired is distinct from excluded.desired;
  update complaint_tag_mirror m set desired = '{}', updated_at = now()
    where m.desired <> '{}' and not exists (select 1 from complaint_tag_desired() d where d.phone = m.phone);
  return query
    select m.phone, m.contact_id, m.desired, m.synced from complaint_tag_mirror m
    where p_full or m.synced is null or m.synced is distinct from m.desired
    order by m.updated_at desc;
end $$;
revoke all on function public.complaint_tag_queue(boolean) from public, anon, authenticated;
