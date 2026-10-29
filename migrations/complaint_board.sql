-- Complaint triage, batch 2, step 9 (Kate, 29 Oct 2026): the pipeline board. Run after complaint_people_assign.sql.
--
-- Read only, for leadership and the branch coordinators (a coordinator sees her own branch). The stage is worked out from what people did, never
-- dragged: complaint_triage.state, first_response_at, status and resolved_at.
--   waiting  Waiting to be taken        on the chain, nobody has taken it yet
--   taken    Taken, reply due           someone took it or was assigned it, the client has not been replied to
--   replied  Replied, client back?      replied to the client, still open
--   closed   Closed this week           resolved in the last 7 days
--   minor    Minor, daily summary       parking, billing, booking, wait, product, other (logged in the last 7 days, no clock)
--   stuck    Stuck                      everyone on the list has had it and nobody took it
-- A complaint linked as a duplicate is not on the board.

create or replace function public.cmp_coord_branches() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct b), '{}'::text[]) from (
    select case when p.position ilike '%Saadiyat%' then 'SAA' when p.position ilike '%Khalifa%' then 'KCA' when p.position ilike '%Motor%' then 'MC'
                when p.position ilike '%Al Quoz%' then 'AQ' when p.position ilike '%Bahrain%' then 'BAH' end as b
      from public.kb_positions p
     where lower(p.email) = lower(coalesce(public.kb_me_email(), '#none')) and p.position ilike '%coordinator%') x
   where b is not null
$$;

create or replace function public.cmp_board(p_branch text default 'all', p_mine boolean default false, p_serious boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare leader boolean := public.cmp_leader(); brs text[] := public.cmp_coord_branches(); em text := lower(coalesce(public.kb_me_email(), '#none')); out jsonb;
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
        'replied', b.first_response_at is not null) as card,
      case b.stage when 'stuck' then 0 when 'waiting' then 1 when 'taken' then 2 when 'replied' then 3 when 'closed' then 4 else 5 end as srank,
      coalesce(extract(epoch from b.due_at), 9e12) as due_sort,
      extract(epoch from b.submitted_at) as at_sort
    from (
      select c.id, c.code, c.complaint_type, c.branch_code, c.submitted_by, c.submitted_at, c.status, c.first_response_at, c.resolved_at, c.complaint_date, c.submitted_email,
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
revoke all on function public.cmp_coord_branches(), public.cmp_board(text, boolean, boolean) from public, anon;
grant execute on function public.cmp_coord_branches(), public.cmp_board(text, boolean, boolean) to authenticated;

-- My complaints: a complaint the worker has not routed yet (the first 45 seconds) still shows to the person who was tagged on it
do $m$
declare d text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'cmp_my_list' and pronamespace = 'public'::regnamespace;
  if position('left join public.complaint_triage t' in d) = 0 then
    d := replace(d, 'join public.complaint_triage t on t.complaint_id = c.id', 'left join public.complaint_triage t on t.complaint_id = c.id');
    d := replace(d, '''waiting_on_me'', t.state = ''active'' and exists (', '''waiting_on_me'', coalesce(t.state = ''active'', false) and exists (');
    if position('left join public.complaint_triage t' in d) = 0 or position('coalesce(t.state = ''active'', false)' in d) = 0 then raise exception 'cmp_my_list changed shape, edit by hand'; end if;
    execute d;
  end if;
end $m$;

-- The dot on "My complaints" (Kate, 29 Oct 2026): how many are waiting for me, how many I was tagged on and have not opened, and whether I may see the
-- pipeline. One small call, so every complaint page can show the dot without loading the whole list.
create or replace function public.cmp_my_badge() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me bigint[] := public.cmp_my_ids(); em text := lower(coalesce(public.kb_me_email(), '#none')); w int; tg int;
begin
  if em = '#none' then return null; end if;
  select count(*) into w from public.complaint_triage t join public.client_complaints c on c.id = t.complaint_id
   where c.duplicate_of is null and c.status = 'open'
     and ((t.state = 'active' and exists (select 1 from public.complaint_triage_routes r where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = c.branch_code)))
          or t.state = 'stuck' and public.cmp_leader());
  select count(*) into tg from public.complaint_people pp join public.client_complaints c on c.id = pp.complaint_id
   where pp.kind = 'cc' and pp.seen_at is null and pp.by_name is not null and lower(coalesce(pp.email, '')) = em and c.duplicate_of is null;
  return jsonb_build_object('waiting', w, 'tagged', tg, 'board', public.cmp_leader() or cardinality(public.cmp_coord_branches()) > 0);
end $$;
revoke all on function public.cmp_my_badge() from public, anon;
grant execute on function public.cmp_my_badge() to authenticated;
