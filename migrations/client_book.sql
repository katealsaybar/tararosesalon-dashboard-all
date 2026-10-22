-- Client Book (Kate, 22 Oct 2026): one page for the Phorest client list, contact details, client notes
-- and the notes on each visit, pulled on 21 Oct 2026 for the Zenoti move.
--
-- Tables read (all owner_read only, RLS on, nobody but the owner login can select them directly):
--   phorest_client_emails    one row per client: name, mobile, email, email_status, archived
--   phorest_client_branches  which Phorest branch each client sits under (MC, AQ, KCA, SAA, MRY, FRA)
--   phorest_client_notes     the note on the client card (allergies, formulas)
--   phorest_visit_notes      the note on each visit, with the services booked that day
--
-- The two functions below are the ONLY door the page uses. They are security definer, so they can read
-- those tables, and they refuse anyone under Level 5, because the dashboard's table policies check
-- membership only, not level. Phones, emails and notes never reach a lower level through here.
-- Read only: nothing is written. Safe to run twice.

create or replace function public.client_book_search(
  p_q text default '', p_branch text default 'all', p_limit int default 40, p_offset int default 0)
returns jsonb
language plpgsql stable security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
declare
  q text := lower(trim(coalesce(p_q, '')));
  rawd text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  digits text := ltrim(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '0');
  lim int := least(greatest(coalesce(p_limit, 40), 1), 100);
  off int := greatest(coalesce(p_offset, 0), 0);
  toks text[] := array(select t from unnest(string_to_array(lower(trim(coalesce(p_q, ''))), ' ')) t where t <> '');
  out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Client Book is for Level 5 only';
  end if;

  with hit as (
    select e.branch, e.phorest_id, e.first_name, e.last_name, e.mobile, e.email, e.email_status, e.archived
    from public.phorest_client_emails e
    where (
        q = ''
        or (not exists (select 1 from unnest(toks) t
              where position(t in lower(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))) = 0))
        or (length(rawd) >= 4 and digits <> '' and regexp_replace(coalesce(e.mobile_norm, ''), '\D', '', 'g') like '%' || digits || '%')
        or (position('@' in q) > 0 and lower(coalesce(e.email, '')) like '%' || q || '%')
      )
      and (
        coalesce(p_branch, 'all') = 'all'
        or (p_branch = 'BAH' and e.branch = 'BAH')
        or exists (select 1 from public.phorest_client_branches b
                   where b.phorest_id = e.phorest_id and b.branch_code = p_branch and e.branch = 'UAE')
      )
  ), page as (
    select h.*, count(*) over () as total
    from hit h
    order by lower(coalesce(h.first_name, '')), lower(coalesce(h.last_name, '')), h.phorest_id
    limit lim offset off
  )
  select jsonb_build_object(
    'total', coalesce((select max(total) from page), 0),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'branch', p.branch,
      'id', p.phorest_id,
      'first', p.first_name,
      'last', p.last_name,
      'mobile', p.mobile,
      'email', case when p.email_status = 'real' then p.email else null end,
      'email_status', p.email_status,
      'archived', p.archived,
      'branches', case when p.branch = 'BAH' then jsonb_build_array('BAH') else
        coalesce((select jsonb_agg(distinct b.branch_code) from public.phorest_client_branches b where b.phorest_id = p.phorest_id), '[]'::jsonb) end,
      'has_note', exists (select 1 from public.phorest_client_notes n
                          where n.branch = p.branch and n.phorest_id = p.phorest_id and coalesce(trim(n.notes), '') <> ''),
      'visit_notes', (select count(*) from public.phorest_visit_notes v where v.branch = p.branch and v.phorest_id = p.phorest_id)
    ) order by lower(coalesce(p.first_name, '')), lower(coalesce(p.last_name, '')), p.phorest_id), '[]'::jsonb)
  ) into out
  from page p;

  return out;
end
$function$;

create or replace function public.client_book_card(p_branch text, p_id text)
returns jsonb
language plpgsql stable security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Client Book is for Level 5 only';
  end if;

  select jsonb_build_object(
    'branch', e.branch,
    'id', e.phorest_id,
    'first', e.first_name,
    'last', e.last_name,
    'mobile', e.mobile,
    'email', e.email,
    'email_status', e.email_status,
    'archived', e.archived,
    'pulled_at', e.pulled_at,
    'branches', case when e.branch = 'BAH' then jsonb_build_array('BAH') else
      coalesce((select jsonb_agg(distinct b.branch_code) from public.phorest_client_branches b where b.phorest_id = e.phorest_id), '[]'::jsonb) end,
    'note', (select jsonb_build_object('notes', n.notes, 'archived', n.archived)
             from public.phorest_client_notes n where n.branch = e.branch and n.phorest_id = e.phorest_id),
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
                 'visit_id', v.visit_id,
                 'date', v.visit_date,
                 'at', v.branch_short,
                 'notes', v.notes,
                 'images', v.images_count,
                 'items', coalesce(v.services -> 'items', '[]'::jsonb)
               ) order by v.visit_date desc nulls last, v.visit_id)
               from public.phorest_visit_notes v where v.branch = e.branch and v.phorest_id = e.phorest_id), '[]'::jsonb)
  ) into out
  from public.phorest_client_emails e
  where e.branch = p_branch and e.phorest_id = p_id;

  return out;
end
$function$;

revoke all on function public.client_book_search(text, text, int, int) from public, anon;
revoke all on function public.client_book_card(text, text) from public, anon;
grant execute on function public.client_book_search(text, text, int, int) to authenticated;
grant execute on function public.client_book_card(text, text) to authenticated;
