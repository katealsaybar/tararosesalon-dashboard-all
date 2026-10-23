-- Tool Spend (Kate, 23 Oct 2026). What GoHighLevel, respond.io and Phorest cost, one report each.
-- The table holds one row per payment, invoice or statement line, plus the notes and next steps the page shows. The rows are loaded
-- in Supabase only (from the three spend sheets of 23 Oct 2026) and are NOT kept in this repo: this repo is public and the ledger,
-- card endings and account numbers are internal. To reload a tool, delete its rows and insert from the sheet.
-- kind says what a row is: paid / invoiced / overdue (counted in the totals), used (respond.io usage drawn from a balance, not cash),
-- balance (what is left in a respond.io WhatsApp balance), unknown and memo (shown, never added), note and action (the sentences the
-- page shows under What stands out and The one next step: edit the rows to change them, no deploy needed).
-- The page reads it only through tool_spend_report(), Level 3 and above. Applied live 23 Oct 2026.
create table if not exists tool_spend_lines (
  id          bigserial primary key,
  tool        text    not null check (tool in ('ghl', 'respond', 'phorest')),
  mo          date    not null,
  paid_on     date,
  kind        text    not null check (kind in ('paid', 'invoiced', 'overdue', 'used', 'balance', 'unknown', 'memo', 'note', 'action')),
  category    text,
  item        text,
  branch      text,
  currency    text,
  amount      numeric,
  amount_aed  numeric,
  counted     boolean not null default true,
  owner       text,
  due         date,
  note        text,
  loaded_at   timestamptz not null default now()
);
alter table tool_spend_lines enable row level security;   -- no policies: read through tool_spend_report only
create index if not exists tool_spend_lines_tool_mo on tool_spend_lines (tool, mo);

create or replace function public.tool_spend_report()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Tool Spend is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'as_of', current_date,
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      't', tool, 'mo', mo, 'd', paid_on, 'k', kind, 'c', category, 'i', item, 'b', branch, 'cur', currency,
      'u', amount, 'a', amount_aed, 'n', counted, 'o', owner, 'due', due) order by tool, mo, paid_on nulls last, id), '[]'::jsonb)
  ) into out
  from tool_spend_lines;
  return out;
end;
$function$;
revoke all on function public.tool_spend_report() from public, anon;
grant execute on function public.tool_spend_report() to authenticated;
