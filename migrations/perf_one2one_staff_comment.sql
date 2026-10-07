-- The stylist can add a comment when she acknowledges and signs a 1-to-1 or Goals record (Kate, 7 Oct 2026).
-- perf_one2one.staff_comment (at most 2000 characters, checked in perf_one2one_confirm); it travels
-- into history when a record is reopened and is cleared, like her signature, and the stylist's own
-- page keeps showing the version she last signed. perf_one2one_confirm gained p_comment; perf_one2one_reopen
-- and perf_one2one_me were replaced to carry it. Applied live as perf_one2one_staff_comment; this file is the
-- short record of it.
alter table perf_one2one add column if not exists staff_comment text;
-- drop function if exists perf_one2one_confirm(uuid, text, date, text);
-- perf_one2one_confirm(p_token uuid, p_kind text, p_period date, p_sig text default null, p_comment text default null)
--   sets status = 'filed', confirmed_at = now(), staff_sig = p_sig, staff_comment = nullif(trim(p_comment), '').
grant execute on function perf_one2one_confirm(uuid, text, date, text, text) to anon, authenticated;
