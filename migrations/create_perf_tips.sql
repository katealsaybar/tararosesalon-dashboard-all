-- Win + top tip, AI-written (Kate, 30 Sep 2026, from Tara on the 30 Sep call).
--
-- One row per person per month, written by the perf-coach edge function
-- (action "tips") once a month, never on page load. The stylist page and the
-- monthly email read it through perf_tip / perf_tip_by_id; when there is no row
-- they fall back to the formula in performance/win-gap.js.
--
-- RLS on with no policies, like every perf_ table: only the security-definer
-- functions below and the service role can touch it.

create table if not exists public.perf_tips (
  staff_id   uuid not null references public.perf_staff(id) on delete cascade,
  month      date not null,
  win        text not null,
  tip        text not null,
  how        text,
  model      text,
  created_at timestamptz not null default now(),
  primary key (staff_id, month)
);
alter table public.perf_tips enable row level security;

-- Her own tip, from her own link.
create or replace function public.perf_tip(p_token uuid, p_month date default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('win', t.win, 'tip', t.tip, 'how', t.how, 'model', t.model, 'at', t.created_at)
  from perf_tips t join perf_staff s on s.id = t.staff_id
  where s.token = p_token and s.active
    and t.month = date_trunc('month', coalesce(p_month, current_date))::date
$$;

-- A leader looking at someone's page from the team view.
create or replace function public.perf_tip_by_id(p_admin uuid, p_staff_id uuid, p_month date default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('win', t.win, 'tip', t.tip, 'how', t.how, 'model', t.model, 'at', t.created_at)
  from perf_tips t
  where exists (select 1 from perf_admins where token = p_admin and role in ('leader', 'viewer'))
    and t.staff_id = p_staff_id
    and t.month = date_trunc('month', coalesce(p_month, current_date))::date
$$;

grant execute on function public.perf_tip(uuid, date), public.perf_tip_by_id(uuid, uuid, date) to anon, authenticated;
