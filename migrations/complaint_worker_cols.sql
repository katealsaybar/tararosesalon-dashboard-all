-- Complaint triage, batch 2, worker support (Kate, 29 Oct 2026). Run after complaint_people_assign.sql.
--   last_digest_on  the day the minor summary last went out (once a day, after 9:30 am Dubai)
--   digested_at     when a minor complaint was put in a summary, so it is in one summary only
alter table public.complaint_triage_config add column if not exists last_digest_on date;
alter table public.complaint_triage add column if not exists digested_at timestamptz;

-- The ticket's timeline marks the lines the system wrote into the follow-up list (assigned, linked as a duplicate) as 'system', so they do not read as "X added a note".
do $m$
declare d text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'cmp_timeline' and pronamespace = 'public'::regnamespace;
  if position('''system''' in d) = 0 then
    d := replace(d, 'case when u.status = ''responded'' then ''reply'' else ''note'' end as kind',
                    'case when u.status = ''responded'' then ''reply'' when u.note ~ ''^(Assigned to |Linked as a duplicate of |No longer linked as a duplicate)'' then ''system'' else ''note'' end as kind');
    if position('''system''' in d) = 0 then raise exception 'cmp_timeline changed shape, edit by hand'; end if;
    execute d;
  end if;
end $m$;
