-- 21 Oct 2026 (Kate): the WV Blast page shows who on the list has bought a Wellness Voucher since the blast started.
-- Already applied to gvijxenafoowajqktqvd by Claude (Supabase MCP). Safe to re-run.
-- wv_blast_get() now adds bought_on, bought_serial, bought_aed and bought_pay (the Phorest tender code, S = Stripe,
-- T = Tabby-Link, CC = card) to a row when her name matches a voucher sale from 15 Oct on in sales_transaction_lines.
-- wv_blast_alias holds the odd spelling that does not match by name (Emma Nobla on the list, Emma Noble at the till).
create table if not exists public.wv_blast_alias (client_key text primary key, sales_name text not null);
alter table public.wv_blast_alias enable row level security;
insert into public.wv_blast_alias (client_key, sales_name) values ('emma nobla', 'emma noble') on conflict (client_key) do nothing;

create or replace function public.wv_blast_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  return (
    with sales as (
      select distinct on (item) item as serial, date as bought_on, lower(btrim(client_name)) as ck,
             total::numeric as aed, regexp_replace(payment_raw, '\([^)]*\)', '', 'g') as pay
        from public.sales_transaction_lines
       where item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$' and date >= date '2026-10-15'
       order by item, date),
    first_buy as (select distinct on (ck) * from sales order by ck, bought_on, serial)
    select coalesce(jsonb_agg(
             to_jsonb(b) || case when f.serial is null then '{}'::jsonb else jsonb_build_object(
               'bought_on', f.bought_on, 'bought_serial', replace(f.serial, 'Voucher ', ''), 'bought_aed', f.aed, 'bought_pay', f.pay) end
             order by coalesce(b.band, 9), b.branch, b.spend desc), '[]'::jsonb)
      from public.wv_blast b
      left join public.wv_blast_alias a on a.client_key = b.client_key
      left join first_buy f on f.ck = coalesce(a.sales_name, b.client_key));
end $$;
revoke all on function public.wv_blast_get() from public, anon;
grant execute on function public.wv_blast_get() to authenticated;
