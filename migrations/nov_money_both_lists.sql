-- 24 Nov 2026 (Kate, on Due, hair: "8 booked, 18 came in and paid, 25 people in all": "shouldn't we indicate the overlap, and where?").
-- Follows nov_money_people_once.sql. Adds the overlap itself:
--   1. nov_campaign_money: `both_lists` on all, by_blast and by_branch (clients booked ahead who have also paid since the message).
--   2. nov_drill: metric 'both' (per client), so the figure opens the clients who are in both lists.
-- Additive. Patches the live function bodies in place.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.nov_campaign_money()'::regprocedure);
  if d like '%as both_lists%' then raise notice 'nov_campaign_money already has both_lists'; else
    d := replace(d, 'count(*) filter (where sf.ahead or sf.spent > 0) as people,', 'count(*) filter (where sf.ahead or sf.spent > 0) as people, count(*) filter (where sf.ahead and sf.spent > 0) as both_lists,');
    d := replace(d, 'sum(people) as people,', 'sum(people) as people, sum(both_lists) as both_lists,');
    if d not like '%sum(both_lists) as both_lists%' or d not like '%as both_lists,%' then raise exception 'nov_campaign_money patch did not apply'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.nov_drill(text,text,text,text,text,text)'::regprocedure);
  if d like '%''both''%' then raise notice 'nov_drill already has both'; else
    d := replace(d, '''late'', ''people'')', '''late'', ''people'', ''both'')');
    d := replace(d, E'      when ''people'' then status = ''sent'' and (ahead or spent > 0)\n', E'      when ''people'' then status = ''sent'' and (ahead or spent > 0)\n      when ''both'' then status = ''sent'' and ahead and spent > 0\n');
    if d not like '%when ''both'' then%' or d not like '%''people'', ''both'')%' then raise exception 'nov_drill patch did not apply'; end if;
    execute d;
  end if;
end $$;
