-- Lost Clients: reception picks the number for a client with 2+ numbers (Kate, 13 Oct 2026, follows lost_multi_numbers.sql).
-- A client with no single active number sat as "Check numbers (not messaged)". Each review sheet now has a "Which number?" column with a
-- dropdown of her numbers; lost_review_sheets.py sync reads it and writes the choice here.
--
--   lost_phone_choice            one chosen number per client (client_key, phone, set_by, set_at). Nobody reads it directly.
--   lost_sheet_phone_apply(pass, set, clear, by)   set = [{"k": client_key, "p": phone}], clear = client keys. A phone is stored only if it is one
--                                of her numbers in lost_lists_base.phones. Push-pass gated.
--   lost_phone_pick()            a chosen number wins: n_active = 1, pick = the chosen number, and the new chosen / pick_ok columns say which it was and
--                                whether that number is active on WhatsApp. A chosen number that is blocked or opted out in respond.io is ignored.
--   lost_queue()                 a client whose picked number is not active on WhatsApp is shown as wa 'text' (a text, not WhatsApp).
--   lost_sheet_rows()            gains phone_chosen.
-- Applied live 13 Oct 2026.

create table if not exists public.lost_phone_choice (
  client_key text primary key,
  phone text not null,
  set_by text,
  set_at timestamptz not null default now()
);
alter table public.lost_phone_choice enable row level security;

create or replace function public.lost_sheet_phone_apply(p_pass uuid, p_set jsonb, p_clear text[], p_by text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare ns int := 0; nc int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if jsonb_array_length(coalesce(p_set, '[]'::jsonb)) > 3000 or coalesce(array_length(p_clear, 1), 0) > 3000 then raise exception 'too many at once'; end if;
  insert into lost_phone_choice (client_key, phone, set_by)
    select distinct on (x->>'k') x->>'k', btrim(x->>'p'), left(coalesce(p_by, 'Sheet'), 80)
    from jsonb_array_elements(coalesce(p_set, '[]'::jsonb)) x
    join lost_lists_base b on b.client_key = x->>'k' and btrim(x->>'p') = any(string_to_array(b.phones, ' / '))
  on conflict (client_key) do update set phone = excluded.phone, set_by = excluded.set_by, set_at = now()
    where lost_phone_choice.phone is distinct from excluded.phone;
  get diagnostics ns = row_count;
  delete from lost_phone_choice where client_key = any(coalesce(p_clear, '{}'::text[]));
  get diagnostics nc = row_count;
  return jsonb_build_object('set', ns, 'cleared', nc);
end $function$;
revoke all on function public.lost_sheet_phone_apply(uuid, jsonb, text[], text) from public;
grant execute on function public.lost_sheet_phone_apply(uuid, jsonb, text[], text) to anon, authenticated;

drop function if exists public.lost_phone_pick();
create function public.lost_phone_pick()
returns table(client_key text, n_phones int, n_active int, pick text, chosen text, pick_ok boolean)
language sql stable security definer set search_path to 'public' as $function$
  with t as (
    select b.client_key, btrim(x) as ph, w.last_in,
           coalesce(w.is_blocked, false) or coalesce(w.opted_out, false) as bad,
           coalesce(w.found and w.last_in > now() - interval '548 days' and not coalesce(w.is_blocked, false) and not coalesce(w.opted_out, false), false) as ok
    from lost_lists_base b
    cross join lateral unnest(string_to_array(b.phones, ' / ')) as x
    left join lost_wa_status w on w.phone = btrim(x)
    where b.phones like '% / %'
  ), g as (
    select t.client_key, count(*)::int as n_phones, count(*) filter (where t.ok)::int as n_active,
           (array_agg(t.ph order by t.last_in desc nulls last) filter (where t.ok))[1] as pick
    from t group by t.client_key
  )
  select g.client_key, g.n_phones,
         case when c.phone is not null then 1 else g.n_active end,
         coalesce(c.phone, g.pick), c.phone,
         case when c.phone is not null then c.ok else g.n_active = 1 end
  from g
  left join lateral (
    select ch.phone, t.ok from lost_phone_choice ch join t on t.client_key = ch.client_key and t.ph = ch.phone
    where ch.client_key = g.client_key and not t.bad
  ) c on true
$function$;
revoke all on function public.lost_phone_pick() from public, anon, authenticated;

do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.lost_queue()'::regprocedure);
  if d not like '%pick_ok%' then
    if position('pp.n_active as nact, pp.pick as pick,' in d) = 0 or position('''wa'', q.wa, ''last_in''' in d) = 0 then
      raise exception 'lost_queue() is not the shape this migration expects';
    end if;
    d := replace(d, 'pp.n_active as nact, pp.pick as pick,', 'pp.n_active as nact, pp.pick as pick, pp.pick_ok as pick_ok,');
    d := replace(d, '''wa'', q.wa, ''last_in''', '''wa'', case when q.nact = 1 and not coalesce(q.pick_ok, true) then ''text'' else q.wa end, ''last_in''');
    execute d;
  end if;

  d := pg_get_functiondef('public.lost_sheet_rows(uuid,text)'::regprocedure);
  if d not like '%phone_chosen%' then
    if position('''check_numbers'', coalesce(pp.n_active <> 1, false),' in d) = 0 then
      raise exception 'lost_sheet_rows(uuid,text) is not the shape this migration expects';
    end if;
    d := replace(d, '''check_numbers'', coalesce(pp.n_active <> 1, false),', '''check_numbers'', coalesce(pp.n_active <> 1, false), ''phone_chosen'', pp.chosen,');
    execute d;
  end if;
end
$mig$;
