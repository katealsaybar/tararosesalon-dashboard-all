-- Lost Clients: where the four review Google Sheets are, so the page can open them (Kate, 12 Oct 2026).
-- lost_sheet_links()  Level 2 and above: {"SAA": url, "KCA": url, "MC": url, "AQ": url}. The links are not secret (the sheet's own
-- sharing decides who can open it) but are kept here, not in the public repo. The table is written by hand or by
-- phorest data export/lost review sheets/lost_review_sheets.py create (SQL below for the four sheets made on 12 Oct 2026).
-- lost_exclude_bulk (lost_review_notes.sql) is no longer called by the page: the review file upload it served was removed the same day.

create table if not exists public.lost_sheet_links (
  branch     text primary key check (branch in ('SAA','KCA','MC','AQ')),
  url        text not null,
  updated_at timestamptz not null default now()
);
alter table public.lost_sheet_links enable row level security;
revoke all on public.lost_sheet_links from anon, authenticated;

create or replace function public.lost_sheet_links() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  return coalesce((select jsonb_object_agg(branch, url) from lost_sheet_links), '{}'::jsonb);
end $function$;
revoke all on function public.lost_sheet_links() from public, anon;
grant execute on function public.lost_sheet_links() to authenticated;

-- insert into public.lost_sheet_links (branch, url) values ('SAA', 'https://docs.google.com/spreadsheets/d/<id>/edit'), ... on conflict (branch) do update set url = excluded.url, updated_at = now();
