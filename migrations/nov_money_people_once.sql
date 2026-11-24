-- 24 Nov 2026 (Kate): "So does this mean 56 people in total yeah?" Booked ahead (14) and Came in and paid (42) are two lists that overlap,
-- so adding them counts a client twice. This adds ONE count of people, each client once: booked ahead OR paid at the till since the message.
--   1. nov_campaign_money: `people` on all, by_blast and by_branch (count of clients where ahead or spent > 0).
--   2. nov_drill: metric 'people' (per client), so the figure opens the clients behind it.
-- Additive: no existing key changes. Patches the live function bodies in place, so it keeps whatever is already there.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.nov_campaign_money()'::regprocedure);
  if d like '%as people%' then raise notice 'nov_campaign_money already has people'; else
    d := replace(d, 'count(*) filter (where sf.spent > 0) as visited,', 'count(*) filter (where sf.spent > 0) as visited, count(*) filter (where sf.ahead or sf.spent > 0) as people,');
    d := replace(d, 'sum(visited) as visited,', 'sum(visited) as visited, sum(people) as people,');
    if d not like '%sum(people)%' or d not like '%as people,%' then raise exception 'nov_campaign_money patch did not apply'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.nov_drill(text,text,text,text,text,text)'::regprocedure);
  if d like '%''people''%' then raise notice 'nov_drill already has people'; else
    d := replace(d, '''bsince'', ''late'')', '''bsince'', ''late'', ''people'')');
    d := replace(d, E'      when ''paid'' then status = ''sent'' and spent > 0\n', E'      when ''paid'' then status = ''sent'' and spent > 0\n      when ''people'' then status = ''sent'' and (ahead or spent > 0)\n');
    if d not like '%when ''people''%' or d not like '%''late'', ''people'')%' then raise exception 'nov_drill patch did not apply'; end if;
    execute d;
  end if;
end $$;
