-- Lost Clients: Last service shows the latest service on any date (Kate, 13 Oct 2026).
-- Latif Al Bunnia (Al Quoz, last visit 14 Dec 2025, retail only) showed a blank Last service, and Kate asked whether a blank
-- always means retail only. It did not: last_other / last_colour / last_toner only look inside lost_lists_config.window_from..window_to
-- (1 May 2025 to 31 May 2026), so in Group 4 1,325 of the 1,346 blank cells were clients last seen before 1 May 2025 who did have a service.
--
-- lost_lists_base.last_service_any = the latest service on any date since lost_lists_config.since (same service test as last_other,
-- no window, colour family included). It is used ONLY for the last_service shown by lost_lists() and lost_sheet_rows().
-- last_other is untouched, so who is in Group 5 (and every other group flag) does not change.
-- After this, a blank Last service means no service at all since 1 Jan 2025 (retail only, like Latif).
--
-- Applied live 13 Oct 2026, then lost_lists_refresh() run once to fill the column (the nightly cron keeps it filled).

alter table public.lost_lists_base add column if not exists last_service_any date;

do $mig$
declare d text;
begin
  -- 1. the nightly rebuild fills the new column
  d := pg_get_functiondef('public.lost_lists_refresh()'::regprocedure);
  if d not like '%last_service_any%' then
    if position('last_other, cats, stylist' in d) = 0 or position('string_agg(distinct l.category, '', '') filter' in d) = 0 then
      raise exception 'lost_lists_refresh() is not the shape this migration expects';
    end if;
    d := replace(d, 'last_other, cats, stylist', 'last_other, last_service_any, cats, stylist');
    d := replace(d, 'string_agg(distinct l.category, '', '') filter',
      'max(l.date) filter (where l.kind = ''service'' and l.family not in (''retail'',''skip'') and l.category <> ''SKIP''),' || chr(10) ||
      '         string_agg(distinct l.category, '', '') filter');
    execute d;
  end if;

  -- 2. the page's list
  d := pg_get_functiondef('public.lost_lists(text)'::regprocedure);
  if d not like '%last_service_any%' then
    if position('select co.*, b.last_other' in d) = 0 or position('greatest(c.last_keratin, c.last_colour, c.last_toner, c.last_other)' in d) = 0 then
      raise exception 'lost_lists(text) is not the shape this migration expects';
    end if;
    d := replace(d, 'select co.*, b.last_other', 'select co.*, b.last_other, b.last_service_any');
    d := replace(d, 'greatest(c.last_keratin, c.last_colour, c.last_toner, c.last_other)', 'greatest(c.last_keratin, c.last_colour, c.last_toner, c.last_other, c.last_service_any)');
    execute d;
  end if;

  -- 3. the reception sheets
  d := pg_get_functiondef('public.lost_sheet_rows(uuid,text)'::regprocedure);
  if d not like '%last_service_any%' then
    if position('greatest(c.last_keratin, c.last_colour, c.last_toner, b.last_other)' in d) = 0 then
      raise exception 'lost_sheet_rows(uuid,text) is not the shape this migration expects';
    end if;
    d := replace(d, 'greatest(c.last_keratin, c.last_colour, c.last_toner, b.last_other)', 'greatest(c.last_keratin, c.last_colour, c.last_toner, b.last_other, b.last_service_any)');
    execute d;
  end if;
end
$mig$;
