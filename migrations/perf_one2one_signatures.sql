-- Signatures on the 1-to-1 and Goals forms (Kate, 7 Oct 2026). Each side can attach a signature when
-- they sign: drawn with a finger or mouse, or an uploaded picture, as a small PNG/JPEG data URL
-- (at most 400 KB, checked here). The manager's is stored when a leader signs off, the stylist's
-- when she confirms; both are optional (without one the PDF shows the name and the time). They
-- travel with the record: reopening moves them into history and clears them, and the stylist's
-- own page keeps showing the version she last signed. Applied live; this file is the record.
alter table perf_one2one add column if not exists manager_sig text, add column if not exists staff_sig text;

drop function if exists perf_one2one_sign(uuid, uuid, text, date);
drop function if exists perf_one2one_confirm(uuid, text, date);

create or replace function perf_one2one_sign(p_admin uuid, p_token uuid, p_kind text, p_period date, p_sig text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
declare who text; s perf_staff; per date;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if who is null or s.id is null or p_kind not in ('monthly', 'goals') then return 'denied'; end if;
  if p_sig is not null and (length(p_sig) > 400000 or p_sig !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then return 'bad signature'; end if;
  per := case when p_kind = 'monthly' then date_trunc('month', p_period)::date else date_trunc('year', p_period)::date end;
  update perf_one2one set status = 'signed', signed_by = who, signed_at = now(), confirmed_at = null,
         manager_sig = p_sig, staff_sig = null,
         snapshot = perf_o2o_numbers(s), updated_by = who, updated_at = now()
   where staff_id = s.id and kind = p_kind and period = per and status = 'draft';
  return case when found then 'ok' else 'nothing to sign' end;
end $$;

create or replace function perf_one2one_confirm(p_token uuid, p_kind text, p_period date, p_sig text default null) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if sid is null then return false; end if;
  if p_sig is not null and (length(p_sig) > 400000 or p_sig !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then return false; end if;
  update perf_one2one set status = 'filed', confirmed_at = now(), staff_sig = p_sig
   where staff_id = sid and kind = p_kind and period = p_period and status = 'signed';
  return found;
end $$;

-- perf_one2one_reopen and perf_one2one_me were replaced in the same migration to carry
-- manager_sig / staff_sig (into history on reopen, and into the records the stylist reads).
grant execute on function perf_one2one_sign(uuid, uuid, text, date, text) to anon, authenticated;
grant execute on function perf_one2one_confirm(uuid, text, date, text)    to anon, authenticated;
