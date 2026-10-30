-- Staff Payroll WhatsApp: save the whole list in one go (Kate, 30 Oct 2026: "save list, taas at baba").
-- The ticks on the page ARE the payroll list now: who is ticked gets the payslip WhatsApp that goes with each payslip email
-- (migrations/staff_wa_payslip.sql reads staff_phones.wa_payroll) and anything queued from the page. One call replaces the list, so a half-saved list
-- cannot happen. Only wa_payroll is touched; the campaign list (wa_campaign) is left alone. Level 5 only, like the rest of the page.

create or replace function public.staff_wa_payroll_list_set(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_in int; n_out int;
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  update staff_phones set wa_payroll = (id = any (coalesce(p_ids, '{}'::bigint[])))
   where wa_payroll is distinct from (id = any (coalesce(p_ids, '{}'::bigint[])));
  select count(*) filter (where wa_payroll), count(*) filter (where not wa_payroll) into n_in, n_out from staff_phones;
  return jsonb_build_object('in', n_in, 'out', n_out);
end $$;

revoke all on function public.staff_wa_payroll_list_set(bigint[]) from public, anon, authenticated;
grant execute on function public.staff_wa_payroll_list_set(bigint[]) to authenticated;
