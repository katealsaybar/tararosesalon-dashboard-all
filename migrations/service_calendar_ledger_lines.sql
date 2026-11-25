-- Kate, 25 Nov 2026: the ledger figures on the Service Calendar's Client types table open the ledger's own clients, so they can be
-- compared with Phorest's. This returns the lines of ledger_client_lines (ledger_client_lines_table.sql) for one salon and up to 31 days:
--   [date, staff as the day tab heads her column, type (N, R, SC, NCR, RB), client first name, name typed on that row (false = taken from the row above, a RB line),
--    service, amount]
-- Same gate as service_calendar (the page's own access list) and Level 2 and up, like the ledger figures beside it. Read only.

create or replace function public.service_calendar_ledger(p_branch text, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.kb_me_email() is null or not public.kb_can_read_for(public.kb_me_email(), 'servicecal') then return null; end if;
  if p_branch not in ('SAA', 'KCA', 'MC', 'AQ', 'BAH') then return null; end if;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_array(to_char(l.date, 'YYYY-MM-DD'), l.staff, l.type, l.client_first, l.typed, coalesce(l.service, ''), l.amount) order by l.date, l.staff, l.row_no)
    from public.ledger_client_lines l
    where l.branch = p_branch and l.date between p_from and least(coalesce(p_to, p_from), p_from + 30)
  ), '[]'::jsonb);
end $$;
revoke all on function public.service_calendar_ledger(text, date, date) from public, anon;
grant execute on function public.service_calendar_ledger(text, date, date) to authenticated;
