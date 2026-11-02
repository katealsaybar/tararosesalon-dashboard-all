-- November Blasts v2 (Kate, 2 Nov 2026): the redesign. Four lanes on the page (Decisions, Messages, Before sending, Replies), and the "Before sending" list gets a state
-- Kate can tick. Additive: one table and one function, and nov_blast_get returns the ticks as 'checks'. Same guards as the rest of November Blasts
-- (old Levels 3 and 5 write, blast_plan_guard). The words stay in nov_blast_items in the database, not in this public file: the checklist lines (item 'pre',
-- data.tasks and data.rules), the call centre replies (item 'reply') and the terms (item 'terms') are loaded by the cowork repo's docs/NOV-2026-BLAST-SEED-V4.sql.
--   item 'pre'   data: { title, lead, tasks:[{id, t, owner, due, state open|wait|later, wait, d}], rules:[[title, text]] }
--   item 'reply' data: { D: "text with {{1}} {{3}}", A: null, ... }   one reply script per blast, null = not written yet
--   item 'terms' data: { smooth: {title, intro, pts:[[lead, text]]}, invite: {...} }   a blast points at its terms with data.tkey
--   decisions    data: { q, why, figs:[[label, blast, n|ext|blonde|colour]], o:[[label, text, suggested]] }   live figures under the question, each opens its clients

create table if not exists public.nov_blast_checks (
  id   text primary key,
  done boolean not null default true,
  by   text,
  at   timestamptz not null default now()
);
alter table public.nov_blast_checks enable row level security;
revoke all on public.nov_blast_checks from anon, authenticated;

create or replace function public.nov_blast_check(p_id text, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.blast_plan_guard();
begin
  if p_id is null or not exists (select 1 from public.nov_blast_items i, jsonb_array_elements(coalesce(i.data -> 'tasks', '[]'::jsonb)) t
                                 where i.id = 'pre' and t ->> 'id' = p_id) then raise exception 'Unknown line'; end if;
  if coalesce(p_done, false) then
    insert into public.nov_blast_checks (id, done, by, at) values (p_id, true, who, now())
    on conflict (id) do update set done = true, by = excluded.by, at = excluded.at;
  else delete from public.nov_blast_checks where id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.nov_blast_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.blast_plan_guard_read();
begin
  return jsonb_build_object(
    'me', who,
    'editor', coalesce((select m.level in (3, 5) from public.dashboard_me() m limit 1), false),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'data', i.data,
                 'review', coalesce(r.review, 'none'), 'review_by', r.review_by, 'review_at', r.review_at) order by i.sort, i.id)
               from public.nov_blast_items i left join public.nov_blast_review r on r.blast_id = i.id), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('idx', d.idx, 'pick', d.pick, 'by', d.by, 'at', d.at) order by d.idx)
               from public.nov_blast_decisions d), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'by', c.by, 'at', c.at) order by c.id)
               from public.nov_blast_checks c where c.done), '[]'::jsonb));
end $$;

revoke all on function public.nov_blast_check(text, boolean), public.nov_blast_get() from public, anon, authenticated;
grant execute on function public.nov_blast_check(text, boolean), public.nov_blast_get() to authenticated;
