-- Kate, 15 Oct 2026: a login can be limited to some branches on the To do list.
--
-- Level 2 logins (the coordinators) all read every branch, because dashboard_users.scope limits the whole
-- dashboard to one branch and is too blunt for them. todo_access holds, per login, the branches whose items
-- they see on the To do list. No row means every branch, as before. Items with no branch (the ads, SEO and
-- social ones, which are Level 3 anyway) stay visible. Level 5 is never limited.
--
--   insert into todo_access (email, branches) values ('shiela.tararose@gmail.com', '{MC}');
--   delete from todo_access where email = 'shiela.tararose@gmail.com';   -- back to every branch
--
-- Branch codes are SAA, KCA, MC, AQ, BAH. Nothing reads this table but todo_can_see(); it has no policy,
-- so the page and anyone signed in cannot read or change it.

create table if not exists public.todo_access (
  email    text primary key check (email = lower(email)),
  branches text[] not null check (cardinality(branches) > 0)
);
alter table public.todo_access enable row level security;
revoke all on public.todo_access from anon, authenticated;

create or replace function public.todo_can_see(p_cat text, p_branch text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((
    with me as (select public.kb_me_email() em)
    select case
      when public.kb_level_for(me.em) is null then false
      when public.kb_level_for(me.em) = 5 then true
      else exists (select 1 from public.todo_categories c
                    where c.key = p_cat and c.min_level <= public.kb_level_for(me.em))
           and coalesce((select nullif(d.scope, '') from public.dashboard_users d where d.email = me.em), p_branch) is not distinct from p_branch
           and not exists (select 1 from public.todo_access a
                            where a.email = me.em and p_branch is not null and not (p_branch = any(a.branches)))
    end from me), false)
$$;
revoke all on function public.todo_can_see(text, text) from public, anon;
grant execute on function public.todo_can_see(text, text) to authenticated;
