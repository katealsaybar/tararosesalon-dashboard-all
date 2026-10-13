-- Lost Clients: a client with 2+ numbers (Kate, 13 Oct 2026).
-- A client is a name, so two different people called "Mariam Khalifa" are one row with four numbers, and one active number made all of them look
-- active. 394 of 7,097 listed clients have 2+ numbers (SAA 139, KCA 213, MC 21, AQ 21). Kate chose: message only the number that is active on
-- WhatsApp, and hold the rest as "Check numbers" until someone decides which number is hers.
--
--   lost_phone_pick()   one row per client with 2+ numbers: n_active = how many of her numbers are active on WhatsApp (in respond.io, wrote to us
--                       in the last 548 days, not blocked, not opted out), pick = the active one (the most recent if there are several).
--                       Internal (execute revoked); called by the two functions below.
--   lost_queue()        To message: a client with n_active = 1 is sent to that number alone (mobile = pick, n_numbers = 1); a client with 2+ numbers
--                       and n_active <> 1 leaves To message and is counted in skipped.check. Nothing else changes.
--   lost_sheet_rows()   gains phone_pick and check_numbers so the review sheets can say which number will be messaged, or "Check numbers (not messaged)".
-- The Groups tab and the group flags are untouched (they still see every number). Applied live 13 Oct 2026.

create or replace function public.lost_phone_pick()
returns table(client_key text, n_phones int, n_active int, pick text)
language sql stable security definer set search_path to 'public' as $function$
  select t.client_key, count(*)::int, count(*) filter (where t.ok)::int,
         (array_agg(t.ph order by t.last_in desc nulls last) filter (where t.ok))[1]
  from (
    select b.client_key, btrim(x) as ph, w.last_in,
           coalesce(w.found and w.last_in > now() - interval '548 days' and not coalesce(w.is_blocked, false) and not coalesce(w.opted_out, false), false) as ok
    from lost_lists_base b
    cross join lateral unnest(string_to_array(b.phones, ' / ')) as x
    left join lost_wa_status w on w.phone = btrim(x)
    where b.phones like '% / %'
  ) t
  group by t.client_key
$function$;
revoke all on function public.lost_phone_pick() from public, anon, authenticated;

do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.lost_queue()'::regprocedure);
  if d not like '%lost_phone_pick%' then
    if position('from q0 c left join mk m on m.client_key = c.client_key' in d) = 0
       or position('select c.*, m.sent_on as mk_on, m.sent_by as mk_by,' in d) = 0
       or position('''mobile'', q.mobile, ''n_numbers'', q.n_numbers,' in d) = 0
       or position('filter (where q.wa in (''act'', ''r18'', ''noreply'', ''text'')), ''[]''::jsonb)' in d) = 0
       or position('''optout'', count(*) filter (where q.wa = ''optout'')),' in d) = 0 then
      raise exception 'lost_queue() is not the shape this migration expects';
    end if;
    d := replace(d, 'from q0 c left join mk m on m.client_key = c.client_key',
                    'from q0 c left join mk m on m.client_key = c.client_key left join public.lost_phone_pick() pp on pp.client_key = c.client_key');
    d := replace(d, 'select c.*, m.sent_on as mk_on, m.sent_by as mk_by,',
                    'select c.*, pp.n_active as nact, pp.pick as pick, m.sent_on as mk_on, m.sent_by as mk_by,');
    d := replace(d, '''mobile'', q.mobile, ''n_numbers'', q.n_numbers,',
                    '''mobile'', case when q.nact = 1 then q.pick else q.mobile end, ''n_numbers'', case when q.nact = 1 then 1 else q.n_numbers end,');
    d := replace(d, 'filter (where q.wa in (''act'', ''r18'', ''noreply'', ''text'')), ''[]''::jsonb)',
                    'filter (where q.wa in (''act'', ''r18'', ''noreply'', ''text'') and coalesce(q.nact, 1) = 1), ''[]''::jsonb)');
    d := replace(d, '''optout'', count(*) filter (where q.wa = ''optout'')),',
                    '''optout'', count(*) filter (where q.wa = ''optout''),' || chr(10) ||
                    '                                  ''check'', count(*) filter (where q.wa in (''act'', ''r18'', ''noreply'', ''text'') and q.nact is not null and q.nact <> 1)),');
    execute d;
  end if;

  d := pg_get_functiondef('public.lost_sheet_rows(uuid,text)'::regprocedure);
  if d not like '%lost_phone_pick%' then
    if position('from c left join lost_lists_base b on b.client_key = c.client_key' in d) = 0
       or position('''mobile'', c.mobile, ''n_numbers'', c.n_numbers, ''wa'', c.wa,' in d) = 0 then
      raise exception 'lost_sheet_rows(uuid,text) is not the shape this migration expects';
    end if;
    d := replace(d, 'from c left join lost_lists_base b on b.client_key = c.client_key',
                    'from c left join lost_lists_base b on b.client_key = c.client_key left join public.lost_phone_pick() pp on pp.client_key = c.client_key');
    d := replace(d, '''mobile'', c.mobile, ''n_numbers'', c.n_numbers, ''wa'', c.wa,',
                    '''mobile'', c.mobile, ''n_numbers'', c.n_numbers, ''wa'', c.wa,' || chr(10) ||
                    '      ''phone_pick'', case when pp.n_active = 1 then pp.pick end, ''check_numbers'', coalesce(pp.n_active <> 1, false),');
    execute d;
  end if;
end
$mig$;
