-- Tool Spend, automatic receipts (Kate, 25 Nov 2026). Neither respond.io nor Phorest has an API that returns what we are billed (respond.io's
-- Developer API covers contacts and messages, Phorest's covers clients, bookings and the till), so the payment emails are the feed: a script in the
-- mailbox that receives them is read by a script on Kate's PC (phorest data export/tool spend/sync_tool_invoices.py, hourly, read only, no Apps Script), which sends each receipt here, and the Tool Spend page picks it up.
--
-- ext_id is the vendor's own number for the document (respond:1701-7436 for a respond.io receipt), unique, so a receipt read twice, or by two runs,
-- is one row. A line that someone loaded by hand has no ext_id and is never touched. Rows that already exist are left exactly as they are (a branch
-- or a note Kate edited stays), so the import only ever adds.
-- Same push pass as the other mailbox scripts (public.push_passes, active). Nothing in this file is secret.
alter table public.tool_spend_lines add column if not exists ext_id text;
create unique index if not exists tool_spend_lines_ext_id on public.tool_spend_lines (ext_id) where ext_id is not null;

-- p_rows: [{ext_id, tool, paid_on, kind, category, item, branch, currency, amount, amount_aed?, mo?}].
-- tool is respond or phorest, kind is paid, invoiced or overdue (the lines the page adds up). A USD amount is converted at 3.81, the rate the
-- company card was actually charged (the same rate every respond.io line already uses); AED is kept as it is; any other currency must bring its own
-- amount_aed. p_dry true writes nothing and returns the same counts.
create or replace function public.tool_spend_import(p_pass uuid, p_rows jsonb, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_tool text; v_kind text; v_cur text; v_amt numeric; v_aed numeric; v_paid date; v_mo date; v_ext text;
  n_new int := 0; n_have int := 0; n_bad int := 0; bad jsonb := '[]'::jsonb; got int;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'at most 500 rows per call'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_ext := nullif(btrim(coalesce(r->>'ext_id', '')), '');
      v_tool := r->>'tool'; v_kind := coalesce(r->>'kind', 'paid'); v_cur := upper(coalesce(r->>'currency', ''));
      v_amt := (r->>'amount')::numeric; v_paid := nullif(r->>'paid_on', '')::date;
      v_mo := coalesce(nullif(r->>'mo', '')::date, date_trunc('month', v_paid)::date);
      if v_ext is null or v_tool not in ('respond', 'phorest') or v_kind not in ('paid', 'invoiced', 'overdue')
         or v_amt is null or v_mo is null then raise exception 'row not understood'; end if;
      v_aed := case when nullif(r->>'amount_aed', '') is not null then (r->>'amount_aed')::numeric
                    when v_cur = 'USD' then round(v_amt * 3.81, 2)
                    when v_cur = 'AED' then v_amt end;
      if v_aed is null then raise exception 'no dirham amount for currency %', v_cur; end if;
      if exists (select 1 from tool_spend_lines where ext_id = v_ext) then n_have := n_have + 1; continue; end if;
      if not p_dry then
        insert into tool_spend_lines (tool, mo, paid_on, kind, category, item, branch, currency, amount, amount_aed, counted, ext_id, note)
        values (v_tool, v_mo, v_paid, v_kind, nullif(r->>'category', ''), nullif(r->>'item', ''), nullif(r->>'branch', ''), v_cur, v_amt, v_aed, true, v_ext, 'auto')
        on conflict (ext_id) where ext_id is not null do nothing;
        get diagnostics got = row_count;
        if got = 0 then n_have := n_have + 1; continue; end if;
      end if;
      n_new := n_new + 1;
    exception when others then
      n_bad := n_bad + 1;
      if jsonb_array_length(bad) < 5 then bad := bad || to_jsonb(coalesce(v_ext, '?') || ': ' || sqlerrm); end if;
    end;
  end loop;
  return jsonb_build_object('dry', p_dry, 'new', n_new, 'already_there', n_have, 'not_understood', n_bad, 'examples', bad);
end $$;
revoke all on function public.tool_spend_import(uuid, jsonb, boolean) from public;
grant execute on function public.tool_spend_import(uuid, jsonb, boolean) to anon;

-- The page reads one more flag per line: x is true when the line arrived through the import, so it can say how much of the page is automatic.
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
      'u', amount, 'a', amount_aed, 'n', counted, 'o', owner, 'due', due, 'x', ext_id is not null) order by tool, mo, paid_on nulls last, id), '[]'::jsonb)
  ) into out
  from tool_spend_lines;
  return out;
end;
$function$;
