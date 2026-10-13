-- Lost Clients: To message in waves (Kate, 13 Oct 2026).
-- The WhatsApp list goes out in four waves by how warm the client is, one open at a time, so Meta does not flag the numbers:
--   Wave 1  pilot, the first 50 of the active group
--   Wave 2  wrote to one of our numbers in the last 12 months (wa = act)
--   Wave 3  last wrote 12 to 18 months ago (wa = r18)
--   Wave 4  in respond.io, no reply seen (wa = noreply), half the daily cap
-- A wave is closed until a Level 4+ person opens it, and the next one cannot open until the one before it is finished.
-- Texts (SMS) have no waves, they are one list.
--
--   lost_waves                one row per wave that has been touched: opened_at / closed_at, who, and the number of opted-out clients when it
--                             opened (lost_queue().skipped.optout), so the page can show the new STOP replies since
--   lost_waves_get()          Level 3+: the rows
--   lost_wave_set(n, action, optouts)   Level 4+: 'open' | 'close' | 'reopen'
--   lost_send_enqueue         now also requires each item to name an open wave ({"wave": n}); an item without one, or for a closed wave, is
--                             skipped with "wave not open". The page does the same check first. This is what stops a stale page sending a closed wave.
-- The per-wave size and the half cap for Wave 4 are enforced by the page (the cap in lost_send_config.daily_cap still holds for everything).

create table if not exists public.lost_waves (
  n int primary key check (n between 1 and 4),
  opened_at timestamptz,
  opened_by text,
  closed_at timestamptz,
  closed_by text,
  optout_at_open int not null default 0
);
alter table public.lost_waves enable row level security;

create or replace function public.lost_waves_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(w) order by w.n), '[]'::jsonb) from lost_waves w);
end $$;

create or replace function public.lost_wave_set(p_n int, p_action text, p_optouts int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text; w lost_waves;
begin
  if lost_send_level() < 4 then raise exception 'Level 4 and above'; end if;
  if p_n is null or p_n not between 1 and 4 then raise exception 'unknown wave'; end if;
  select m.name into who from dashboard_me() m limit 1;
  insert into lost_waves (n) values (p_n) on conflict do nothing;
  select * into w from lost_waves where n = p_n;
  if p_action = 'open' then
    if w.opened_at is not null and w.closed_at is null then raise exception 'That wave is already open'; end if;
    if w.closed_at is not null then raise exception 'That wave is finished. Reopen it to carry on'; end if;
    if p_n > 1 and not exists (select 1 from lost_waves x where x.n = p_n - 1 and x.closed_at is not null) then
      raise exception 'Finish the wave before it first'; end if;
    update lost_waves set opened_at = now(), opened_by = who, closed_at = null, closed_by = null,
           optout_at_open = greatest(coalesce(p_optouts, 0), 0) where n = p_n;
  elsif p_action = 'close' then
    if w.opened_at is null then raise exception 'That wave has not been opened'; end if;
    update lost_waves set closed_at = now(), closed_by = who where n = p_n;
  elsif p_action = 'reopen' then
    if w.closed_at is null then raise exception 'That wave is not finished'; end if;
    if exists (select 1 from lost_waves x where x.n > p_n and x.opened_at is not null) then raise exception 'A later wave has already started'; end if;
    update lost_waves set closed_at = null, closed_by = null where n = p_n;
  else
    raise exception 'unknown action';
  end if;
  return public.lost_waves_get();
end $$;

revoke all on function public.lost_waves_get(), public.lost_wave_set(int, text, int) from public, anon, authenticated;
grant execute on function public.lost_waves_get(), public.lost_wave_set(int, text, int) to authenticated;

-- lost_send_enqueue: every item must name an open wave.
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.lost_send_enqueue(jsonb)'::regprocedure);
  if d not like '%wave not open%' then
    if position($a$if coalesce(ck, '') = '' then reason := 'no client'; end if;$a$ in d) = 0 then
      raise exception 'lost_send_enqueue is not the shape this migration expects'; end if;
    d := replace(d, $a$if coalesce(ck, '') = '' then reason := 'no client'; end if;$a$,
      $a$if coalesce(ck, '') = '' then reason := 'no client'; end if;
    if reason is null and not exists (select 1 from lost_waves w where w.opened_at is not null and w.closed_at is null
         and w.n = case when coalesce(it ->> 'wave', '') ~ '^[1-4]$' then (it ->> 'wave')::int end) then reason := 'wave not open'; end if;$a$);
    execute d;
  end if;
end
$mig$;
