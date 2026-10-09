-- Kate, 9 Oct 2026: the 1-to-1's Review period is editable. Coach Emma is not sure whether the
-- 1-to-1 is monthly or every 13 weeks, so the leader picks the From and To dates (kept in the
-- draft's content as period_from / period_to) and the figures are worked out over that window.
-- No dates picked = the old default, the 13 weeks to the last Sunday, so every existing record
-- reads exactly as before. Aims follow the length of the window (91 days = 3 months, as before).
-- Applied to the live database; this file is the record.

create or replace function perf_o2o_date(t text) returns date
language plpgsql immutable as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return t::date;
exception when others then return null;
end $$;
revoke all on function perf_o2o_date(text) from public, anon, authenticated;

create or replace function perf_o2o_numbers(s perf_staff, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  last_d date := least(current_date, coalesce((select max(date) from phorest_staff_daily), current_date));
  d2 date := date_trunc('week', last_d + 1)::date - 1;
  d1 date;
  n int;
  st date := perf_start_date(s);
  lv jsonb; off int; fct numeric; c jsonb; cl jsonb; rws jsonb;
  bt jsonb := (select jsonb_object_agg(kpi, target) from perf_benchmarks where level = s.level);
  bm jsonb := (select jsonb_object_agg(kpi, minimum) from perf_benchmarks where level = s.level);
begin
  d1 := d2 - 90;
  -- A picked window has to make sense: not in the future, not before 2021, at most about 13 months.
  if p_to is not null and p_to <= current_date and p_to >= date '2021-01-01' then d2 := p_to; d1 := p_to - 90; end if;
  if p_from is not null and p_from <= d2 and p_from >= date '2021-01-01' and d2 - p_from <= 400 then d1 := p_from; end if;
  n := d2 - d1 + 1;
  lv := perf_leave(s, d1, d2);
  c := perf_core(s, d1, d2);
  cl := perf_clients(s, d1, d2);

  select coalesce(sum(greatest(0, least(d2, (l->>'to')::date) - greatest(d1, (l->>'from')::date) + 1)), 0)::int
    into off from jsonb_array_elements(coalesce(lv->'leave', '[]'::jsonb)) l;
  if st is not null and st > d1 then off := off + least(n, st - d1); end if;
  off := least(off, greatest(n - 7, 0));
  fct := greatest(n - off, 1)::numeric / 91 * 3;

  select jsonb_object_agg(k, jsonb_build_object(
           'a', a,
           't', case when kind = 'sum' then round((bt->>k)::numeric * fct) else (bt->>k)::numeric end,
           'mn', case when kind = 'sum' then round((bm->>k)::numeric * fct) else (bm->>k)::numeric end,
           'm', case when kind = 'sum' then round(a / fct) end))
    into rws
  from (select k, kind, (c->>k)::numeric a
          from (values ('hair_services', 'sum'), ('treatments', 'sum'), ('retail', 'sum'), ('total_revenue', 'sum'),
                       ('clients', 'sum'), ('new_clients', 'sum'),
                       ('avg_bill', 'avg'), ('rebooking_pct', 'avg'), ('column_fill_pct', 'avg')) v(k, kind)) q;

  rws := rws
    || jsonb_build_object('retention_pct', jsonb_build_object('a', (cl->>'retention_pct')::numeric, 't', (bt->>'retention_pct')::numeric,
                           'mn', (bm->>'retention_pct')::numeric, 'n', (cl->>'retention_n')::int))
    || jsonb_build_object('conversion_pct', jsonb_build_object('a', (cl->>'conversion_pct')::numeric, 't', (bt->>'conversion_pct')::numeric,
                           'mn', (bm->>'conversion_pct')::numeric, 'n', (cl->>'conversion_n')::int));

  return jsonb_build_object('from', d1, 'to', d2, 'off_days', off, 'months', round(fct, 2),
                            'level', s.level, 'has_aims', bt is not null, 'rows', rws,
                            'asof', now(), 'data_through', last_d,
                            'client_through', (select max(date) from sales_transaction_lines));
end $$;
revoke all on function perf_o2o_numbers(perf_staff, date, date) from public, anon, authenticated;

-- The one-argument form stays, and means the default window.
create or replace function perf_o2o_numbers(s perf_staff) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select perf_o2o_numbers(s, null, null)
$$;
revoke all on function perf_o2o_numbers(perf_staff) from public, anon, authenticated;

-- perf_one2one_get now also returns numbers_m: the figures over the monthly record's own window
-- (the same as numbers when no dates are picked). perf_one2one_sign freezes a monthly record's
-- snapshot over that window. The full bodies are the live definitions in the database; the two
-- changes against perf_one2one_all.sql are:
--   get:  select content into mc from perf_one2one where staff_id = s.id and kind = 'monthly' and period = m1;
--         'numbers_m', perf_o2o_numbers(s, perf_o2o_date(mc->>'period_from'), perf_o2o_date(mc->>'period_to')),
--   sign: snapshot = case when p_kind = 'goals' then snapshot
--                         when p_kind = 'monthly' then perf_o2o_numbers(s, perf_o2o_date(content->>'period_from'), perf_o2o_date(content->>'period_to'))
--                         else perf_o2o_numbers(s) end,
