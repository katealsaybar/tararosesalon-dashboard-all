-- The Phorest pushers' own pass (Kate, 1 Oct 2026). Round 2 of the dashboard lock takes
-- the public key off the six tables the Python pushers write (push_stock_orders.py,
-- push_sales_lines.py, push_bahrain.py). Rather than give those scripts the project's
-- secret key, which opens everything, they get a pass that can do exactly two things to
-- exactly those six tables: delete one branch's rows for given dates or months, and insert
-- (or upsert) rows. Nothing else in the database answers to it.
--
-- The pass lives in push_passes (no policies: nobody can read it through the API) and in
-- the gitignored "phorest data export/.supabase-secret" file the scripts read. To revoke:
--   update public.push_passes set active = false where label = '...';

create table if not exists public.push_passes (
  token      uuid primary key default gen_random_uuid(),
  label      text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.push_passes enable row level security;
revoke all on public.push_passes from public, anon, authenticated;

create or replace function public.push_tables() returns text[] language sql immutable as $$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines']
$$;

-- Delete one branch's rows: p_eq = {"branch":"SAA","date":"2026-09-30"} (branch required),
-- p_gte / p_lte = {"date":"2026-01-01"} for a range. Returns rows deleted.
create or replace function public.push_delete(p_pass uuid, p_table text, p_eq jsonb,
                                              p_gte jsonb default '{}', p_lte jsonb default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare w text[] := '{}'; k text; v text; n int;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if not (p_table = any(push_tables())) then raise exception 'table % is not a push table', p_table; end if;
  if coalesce(p_eq->>'branch', '') = '' then raise exception 'a delete needs a branch'; end if;
  for k, v in select * from jsonb_each_text(p_eq) union all select * from jsonb_each_text(p_gte)
              union all select * from jsonb_each_text(p_lte) loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = p_table and column_name = k) then raise exception 'no column %', k; end if;
  end loop;
  for k, v in select * from jsonb_each_text(p_eq)  loop w := w || format('%I = %L', k, v); end loop;
  for k, v in select * from jsonb_each_text(p_gte) loop w := w || format('%I >= %L', k, v); end loop;
  for k, v in select * from jsonb_each_text(p_lte) loop w := w || format('%I <= %L', k, v); end loop;
  execute format('delete from public.%I where %s', p_table, array_to_string(w, ' and '));
  get diagnostics n = row_count;
  return n;
end $$;

-- Insert rows (the keys of the first row are the columns), or upsert on p_conflict.
create or replace function public.push_insert(p_pass uuid, p_table text, p_rows jsonb, p_conflict text[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare cols text[]; upd text; n int;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if not (p_table = any(push_tables())) then raise exception 'table % is not a push table', p_table; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then return 0; end if;
  select array_agg(c.column_name::text order by c.ordinal_position) into cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table
     and c.column_name in (select jsonb_object_keys(p_rows->0));
  if cols is null then raise exception 'no matching columns'; end if;
  if p_conflict is null then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
      p_table, (select string_agg(format('%I', c), ',') from unnest(cols) c),
      (select string_agg(format('%I', c), ',') from unnest(cols) c), p_table) using p_rows;
  else
    select string_agg(format('%I = excluded.%I', c, c), ',') into upd from unnest(cols) c where not (c = any(p_conflict));
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) do %s',
      p_table, (select string_agg(format('%I', c), ',') from unnest(cols) c),
      (select string_agg(format('%I', c), ',') from unnest(cols) c), p_table,
      (select string_agg(format('%I', c), ',') from unnest(p_conflict) c),
      case when upd is null then 'nothing' else 'update set ' || upd end) using p_rows;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.push_delete(uuid, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.push_insert(uuid, text, jsonb, text[]) from public;
grant execute on function public.push_delete(uuid, text, jsonb, jsonb, jsonb) to anon;
grant execute on function public.push_insert(uuid, text, jsonb, text[]) to anon;
