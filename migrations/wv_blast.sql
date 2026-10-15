-- Wellness Voucher blast list (Kate, 15 Oct 2026). The 3rd blast list (583 clients, built 8 Oct 2026) refreshed on 15 Oct, kept in
-- the database so the dashboard can show it the way Lost Clients shows its lists. Additive: nothing existing is touched.
--
--   wv_blast                        one row per client: who, wave (as tagged in GHL on 9 Oct), spend, last visit, whether she can be
--                                   messaged on WhatsApp and, if not, why. Clients who dropped off the list stay, labelled, so
--                                   "who left and why" is visible. Wellness Voucher buyers carry the date they bought.
--   wv_blast_get()                  Level 3+: every row
--   wv_blast_candidates(pass, asof) pusher pass: every 2026 client at AED 4,000+ (the refresh script applies the 90-day rule itself)
--   wv_blast_pull(pass)             pusher pass: the rows as they are
--   wv_blast_push(pass, rows)       pusher pass: upsert rows (the refresh script writes the merged list)
--
-- Criteria (same as 8 Oct): 2026 spend AED 4,000+ net ex VAT per branch, last visit within 90 days of the as-of day, SAA / KCA / AQ,
-- a clear single phone number, no Wellness Voucher line yet, a respond.io contact who wrote to a branch WhatsApp number in the last
-- 12 months, not blocked, no unsubscribe tag. Phorest marketing opt-in is NOT checked.
-- Tables have RLS on and no policy; everything reads and writes through these functions (security definer).

create table if not exists public.wv_blast (
  branch        text not null,
  client_key    text not null,
  client        text not null,
  phone         text,
  band          int,                    -- 1 = 10k+, 2 = 8k to 10k, 3 = 6k to 8k, 4 = 5k to 6k, 5 = 4k to 5k (today's spend)
  wave          int,                    -- the send order tagged in GHL on 9 Oct (wv-blast-wave-N); null = not on the 8 Oct list
  spend         numeric,
  last_visit    date,
  can_message   boolean not null default false,
  status        text not null,          -- 'Can message' or why not
  wv_date       date,                   -- last Voucher WV sale line (she bought)
  last_wrote    date,                   -- newest message FROM her in respond.io
  wrote_to      text,                   -- branch number she wrote to
  listed_on     date,                   -- the day she first made the list
  refreshed_on  date not null,
  primary key (branch, client_key)
);
alter table public.wv_blast enable row level security;
revoke all on public.wv_blast from public, anon, authenticated;

create or replace function public.wv_blast_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(b) order by coalesce(b.band, 9), b.branch, b.spend desc), '[]'::jsonb) from public.wv_blast b);
end $$;

create or replace function public.wv_blast_candidates(p_pass uuid, p_asof date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  return (
    with c as (
      select branch, stl_client_key(client_name) as k, max(client_name) as nm, sum(net) as spend, max(date) as last_visit,
             max(date) filter (where item ilike 'Voucher WV%') as wv_date
        from sales_transaction_lines
       where year = 2026 and branch in ('SAA', 'KCA', 'AQ') and coalesce(client_name, '') <> ''
       group by 1, 2)
    select coalesce(jsonb_agg(jsonb_build_object('branch', c.branch, 'client_key', c.k, 'client', c.nm, 'spend', round(c.spend),
             'last_visit', c.last_visit, 'wv_date', c.wv_date,
             'mobile', nullif(cc.mobile, ''), 'landline', nullif(cc.landline, ''))), '[]'::jsonb)
      from c left join client_contacts cc on cc.branch = c.branch and cc.client_key = c.k
     where c.spend >= 4000);
end $$;

create or replace function public.wv_blast_pull(p_pass uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.wv_blast b);
end $$;

create or replace function public.wv_blast_push(p_pass uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  insert into public.wv_blast (branch, client_key, client, phone, band, wave, spend, last_visit, can_message, status, wv_date, last_wrote, wrote_to, listed_on, refreshed_on)
  select r.branch, r.client_key, r.client, r.phone, r.band, r.wave, r.spend, r.last_visit, coalesce(r.can_message, false), r.status, r.wv_date, r.last_wrote, r.wrote_to, r.listed_on, r.refreshed_on
    from jsonb_to_recordset(p_rows) as r(branch text, client_key text, client text, phone text, band int, wave int, spend numeric, last_visit date,
         can_message boolean, status text, wv_date date, last_wrote date, wrote_to text, listed_on date, refreshed_on date)
  on conflict (branch, client_key) do update set client = excluded.client, phone = excluded.phone, band = excluded.band, wave = excluded.wave,
    spend = excluded.spend, last_visit = excluded.last_visit, can_message = excluded.can_message, status = excluded.status, wv_date = excluded.wv_date,
    last_wrote = excluded.last_wrote, wrote_to = excluded.wrote_to, listed_on = excluded.listed_on, refreshed_on = excluded.refreshed_on;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.wv_blast_get() from public, anon;
grant execute on function public.wv_blast_get() to authenticated;
grant execute on function public.wv_blast_candidates(uuid, date), public.wv_blast_pull(uuid), public.wv_blast_push(uuid, jsonb) to anon, authenticated;
alter function public.wv_blast_candidates(uuid, date) set statement_timeout = '90s';  -- the anon role's 8s limit was too short for the sales scan

-- 15 Oct 2026, message test (Kate: "half and half, short vs long"): each wave and branch split 50/50. test_arm = 'short' (the image template
-- with Tell me more / Reserve mine) or 'long' (the plans written out); sub_wave = wave + a (short) or b (long), the GHL tag wv-blast-wave-1a ... 5b.
-- Assigned once in SQL (rows ordered by spend inside wave + branch, alternating, so each half has the same mix); a refresh leaves them alone and new rows start blank.
alter table public.wv_blast add column if not exists test_arm text, add column if not exists sub_wave text;
