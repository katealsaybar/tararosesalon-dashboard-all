-- Discounts and Vouchers report (Kate, 23 Oct 2026): Phorest's Discounts list and Client Vouchers list, archived included, for the Campaigns
-- group in the sidebar. Phorest holds no history of either list, so the page reads a copy that is replaced on every pull
-- (discounts_vouchers_import, same push pass as the other Phorest pushers).
--
-- No client names, serials, emails or notes are stored: the page only needs amounts, dates and the branch a voucher was issued at.
-- Both tables have row level security with no policies, so only the two security definer functions below can touch them.
--
-- phorest_discounts: one row per discount in Phorest (Settings > Discounts), active and archived. kind is a plain-English grouping set by
--   the pull from the name (partner, in house, new client and blasts, AED voucher, complaints and goodwill, staff, loyalty) and can be corrected
--   by SQL; names_closed_branch marks a name that mentions Fratelli or Marasy.
-- phorest_vouchers: one row per client voucher, active, used and archived. branch_code maps Phorest's branch names (Turquoise 7 = SAA, the plain
--   "Tara Rose Hair and Beauty Salon" = KCA, to confirm with Emma; Al Bateen Street = MRY, Fratelli = FRA, both closed).
--
-- discounts_vouchers_report() returns numbers only: vouchers cut by branch and issue month (UAE, AED), and every UAE discount. Level 2 and above.
-- "Expired" is the expiry date before today in Dubai; "soon" is a balance still live that expires within 30 days.

create table if not exists public.phorest_discounts (
  id text primary key,
  business text not null default 'UAE',
  name text not null,
  kind text,
  disc_type text,                -- PERCENT or AMOUNT
  disc_value numeric,
  starts date,
  ends date,
  promo_code text,
  application_mode text,
  archived boolean not null default false,
  names_closed_branch boolean not null default false,
  pulled_at timestamptz not null default now()
);
create table if not exists public.phorest_vouchers (
  id text primary key,
  business text not null default 'UAE',
  branch_name text,
  branch_code text,
  issue_date date,
  expiry_date date,
  archived boolean not null default false,
  original numeric,
  remaining numeric,
  currency text,                 -- AED for the UAE, BHD for Bahrain
  discount_type text,
  discount_value numeric,
  pulled_at timestamptz not null default now()
);
alter table public.phorest_discounts enable row level security;
alter table public.phorest_vouchers enable row level security;
create index if not exists phorest_vouchers_biz_issue_idx on public.phorest_vouchers (business, issue_date);

create or replace function public.discounts_vouchers_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  select jsonb_build_object(
    'at', coalesce((select max(pulled_at) from public.phorest_vouchers), now()),
    'vouchers', coalesce((
      select jsonb_agg(jsonb_build_array(code, mon, n, orig, rem, exprem, expn, liverem, soon, liven) order by code, mon)
      from (
        select coalesce(branch_code, '??') as code, to_char(issue_date, 'YYYY-MM') as mon, count(*) as n,
               round(coalesce(sum(original), 0)) as orig, round(coalesce(sum(remaining), 0)) as rem,
               round(coalesce(sum(remaining) filter (where remaining > 0 and expiry_date < today), 0)) as exprem,
               count(*) filter (where remaining > 0 and expiry_date < today) as expn,
               round(coalesce(sum(remaining) filter (where remaining > 0 and expiry_date >= today), 0)) as liverem,
               count(*) filter (where remaining > 0 and expiry_date >= today and expiry_date <= today + 30) as soon,
               count(*) filter (where remaining > 0 and expiry_date >= today) as liven
        from public.phorest_vouchers
        where business = 'UAE' and issue_date is not null
        group by 1, 2) v), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(jsonb_build_array(name, coalesce(kind, 'Other'), case when disc_type = 'PERCENT' then 'P' else 'A' end, disc_value,
                                         case when archived then 'arc' else 'act' end, coalesce(to_char(ends, 'YYYY-MM-DD'), ''),
                                         case when names_closed_branch then 1 else 0 end)
                       order by archived, name)
      from public.phorest_discounts where business = 'UAE'), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.discounts_vouchers_report() from public, anon;
grant execute on function public.discounts_vouchers_report() to authenticated;

-- The pull replaces a business's whole list: p_discounts / p_vouchers are arrays of objects, p_business is 'UAE' or 'BAH'. A list sent as null is left alone
-- (Bahrain's discounts page asks for a PIN, so only its vouchers are sent).
create or replace function public.discounts_vouchers_import(p_pass uuid, p_business text, p_discounts jsonb default null, p_vouchers jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d int := 0; v int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_business not in ('UAE', 'BAH') then raise exception 'business must be UAE or BAH'; end if;
  if p_discounts is not null then
    if jsonb_typeof(p_discounts) <> 'array' then raise exception 'discounts must be an array'; end if;
    delete from phorest_discounts where business = p_business;
    insert into phorest_discounts (id, business, name, kind, disc_type, disc_value, starts, ends, promo_code, application_mode, archived, names_closed_branch)
      select x->>'id', p_business, x->>'name', x->>'kind', x->>'type', nullif(x->>'value', '')::numeric, nullif(x->>'starts', '')::date, nullif(x->>'ends', '')::date,
             nullif(x->>'promo', ''), x->>'mode', coalesce((x->>'archived')::boolean, false), coalesce((x->>'closed')::boolean, false)
        from jsonb_array_elements(p_discounts) x
      on conflict (id) do update set business = excluded.business, name = excluded.name, kind = excluded.kind, disc_type = excluded.disc_type,
        disc_value = excluded.disc_value, starts = excluded.starts, ends = excluded.ends, promo_code = excluded.promo_code,
        application_mode = excluded.application_mode, archived = excluded.archived, names_closed_branch = excluded.names_closed_branch, pulled_at = now();
    get diagnostics d = row_count;
  end if;
  if p_vouchers is not null then
    if jsonb_typeof(p_vouchers) <> 'array' then raise exception 'vouchers must be an array'; end if;
    delete from phorest_vouchers where business = p_business;
    insert into phorest_vouchers (id, business, branch_name, branch_code, issue_date, expiry_date, archived, original, remaining, currency, discount_type, discount_value)
      select x->>'id', p_business, x->>'branch', x->>'code', nullif(x->>'issued', '')::date, nullif(x->>'expires', '')::date, coalesce((x->>'archived')::boolean, false),
             nullif(x->>'original', '')::numeric, nullif(x->>'remaining', '')::numeric, x->>'currency', x->>'dtype', nullif(x->>'dvalue', '')::numeric
        from jsonb_array_elements(p_vouchers) x
      on conflict (id) do update set business = excluded.business, branch_name = excluded.branch_name, branch_code = excluded.branch_code,
        issue_date = excluded.issue_date, expiry_date = excluded.expiry_date, archived = excluded.archived, original = excluded.original,
        remaining = excluded.remaining, currency = excluded.currency, discount_type = excluded.discount_type, discount_value = excluded.discount_value, pulled_at = now();
    get diagnostics v = row_count;
  end if;
  return jsonb_build_object('discounts', d, 'vouchers', v);
end $$;
revoke all on function public.discounts_vouchers_import(uuid, text, jsonb, jsonb) from public;
grant execute on function public.discounts_vouchers_import(uuid, text, jsonb, jsonb) to anon;
