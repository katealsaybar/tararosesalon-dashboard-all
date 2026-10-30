-- Complaint pipeline, three panes (Kate, 30 Oct 2026): the board also tells the page who the client is, the date it was logged, how urgent it is, and which
-- complaints are mine. Run after complaint_board.sql. Additive: every key the old page read is still there, same stages, same filters, same rows.
--   client     the client's name (the board is only for leadership and the branch coordinators, who may see it)
--   date       the day it was logged (complaint_date, else the Dubai date it was submitted), for the ticket name MM/DD/YYYY | BRANCH | CLIENT | CLASSIFICATION
--   priority   high: stuck, overdue, or a skin reaction or injury. low: minor complaints and anything closed. mid: everything else (colour red, yellow, gray)
--   assigned_me / filed_me / tagged_me   feed the left hand inbox (Assigned to you, You submitted, Tagged you)

create or replace function public.cmp_board(p_branch text default 'all', p_mine boolean default false, p_serious boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare leader boolean := public.cmp_leader(); brs text[] := public.cmp_coord_branches(); em text := lower(coalesce(public.kb_me_email(), '#none')); me bigint[] := public.cmp_my_ids(); out jsonb;
begin
  if em = '#none' or not (leader or cardinality(brs) > 0) then return null; end if;
  select coalesce(jsonb_agg(card order by srank, due_sort, at_sort desc), '[]'::jsonb) into out from (
    select jsonb_build_object(
        'id', b.id, 'code', b.code, 'type', b.complaint_type, 'branch', b.branch_code, 'stage', b.stage, 'grp', b.grp, 'by', b.submitted_by, 'at', b.submitted_at,
        'owner', (select coalesce(r.short_name, r.name) from public.complaint_notify_recipients r where r.id = b.claimed_by),
        'holder', public.cmp_holder(b.id), 'due_at', b.due_at, 'dry_run', b.dry_run, 'resolved_at', b.resolved_at,
        'flag', case when b.status = 'open' then public.cq_flag(b.status, coalesce(b.complaint_date, (b.submitted_at at time zone 'Asia/Dubai')::date), b.first_response_at) end,
        'reply_due', coalesce(b.complaint_date, (b.submitted_at at time zone 'Asia/Dubai')::date) + 2,
        'close_due', coalesce(b.complaint_date, (b.submitted_at at time zone 'Asia/Dubai')::date) + 7,
        'replied', b.first_response_at is not null,
        'client', b.client_name,
        'date', coalesce(b.complaint_date, (b.submitted_at at time zone 'Asia/Dubai')::date),
        'priority', case
            when b.stage = 'closed' then 'low'
            when b.stage = 'stuck' or b.complaint_type = 'skin_reaction_or_injury'
                 or (b.status = 'open' and public.cq_flag(b.status, coalesce(b.complaint_date, (b.submitted_at at time zone 'Asia/Dubai')::date), b.first_response_at) = 'overdue') then 'high'
            when b.grp = 'minor' then 'low'
            else 'mid' end,
        'assigned_me', b.claimed_by is not null and b.claimed_by = any (me),
        'filed_me', lower(coalesce(b.submitted_email, '')) = em,
        'tagged_me', exists (select 1 from public.complaint_people pp where pp.complaint_id = b.id and pp.kind = 'cc' and lower(coalesce(pp.email, '')) = em)) as card,
      case b.stage when 'stuck' then 0 when 'waiting' then 1 when 'taken' then 2 when 'replied' then 3 when 'closed' then 4 else 5 end as srank,
      coalesce(extract(epoch from b.due_at), 9e12) as due_sort,
      extract(epoch from b.submitted_at) as at_sort
    from (
      select c.id, c.code, c.complaint_type, c.branch_code, c.submitted_by, c.submitted_at, c.status, c.first_response_at, c.resolved_at, c.complaint_date, c.submitted_email, c.client_name,
             coalesce(t.grp, public.cmp_group(c.complaint_type)) as grp, t.due_at, t.claimed_by, t.dry_run,
             case
               when c.status = 'resolved' then case when c.resolved_at >= now() - interval '7 days' then 'closed' end
               when t.state = 'stuck' then 'stuck'
               when t.state = 'claimed' and c.first_response_at is not null then 'replied'
               when t.state = 'claimed' then 'taken'
               when coalesce(t.grp, public.cmp_group(c.complaint_type)) = 'minor' then case when c.submitted_at >= now() - interval '7 days' then 'minor' end
               else 'waiting' end as stage
        from public.client_complaints c
        left join public.complaint_triage t on t.complaint_id = c.id
       where c.submitted_at is not null and c.duplicate_of is null and c.is_complaint
         and (leader or c.branch_code = any (brs))
         and (coalesce(nullif(p_branch, ''), 'all') = 'all' or c.branch_code = any (string_to_array(p_branch, ',')))
    ) b
    where b.stage is not null
      and (not coalesce(p_serious, false) or b.grp <> 'minor')
      and (not coalesce(p_mine, false) or public.cmp_holds(b.id) or lower(coalesce(b.submitted_email, '')) = em
           or exists (select 1 from public.complaint_people pp where pp.complaint_id = b.id and pp.kind = 'cc' and lower(coalesce(pp.email, '')) = em))
    order by srank, due_sort, at_sort desc limit 300
  ) q;
  return out;
end $$;
revoke all on function public.cmp_board(text, boolean, boolean) from public, anon;
grant execute on function public.cmp_board(text, boolean, boolean) to authenticated;
