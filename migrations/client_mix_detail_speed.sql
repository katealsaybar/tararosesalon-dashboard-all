-- Kate, 3 Nov 2026: Client Mix, the client list and the items table load in seconds on a long window (APPLIED LIVE 3 Nov 2026).
--
-- client_mix_detail matched the clients to the whole list of sales lines (73,000 for 2026 so far) with a nested loop, once
-- per client, in several places (who had the card, their lines for the clients list, the items table, the Also had row).
-- A card with few clients, like Keratin & Smoothing with 253 this year, still scanned every line 253 times per place: 2026
-- so far took about 50 seconds and Hair treatments ran out of its 30 (the page then drew two empty boxes). Three changes,
-- none of which changes an answer:
--   1. pf     the lines are cut down to the picked families once, and everything after reads that short list;
--   2. pop0   the clients who "had all of these and none of those" come from one pass over each client's list of families
--             (array_agg) instead of a lookup per client per family;
--   3. the clients are matched to their lines with  k in (select k from ...)  so the database hashes the list once, not
--             a nested loop over a materialised list.
-- Checked on a copy of the function next to the old one, md5 of the whole answer equal on 8 picks (October keratin,
-- hair treatments, colour with treatments, colour or treatments or keratin, keratin with colour and without nails at KCA,
-- hair treatments in one category, beauty without colour or cut, July to September keratin).
-- Measured on the live function, as Kate: Keratin & Smoothing 2026 so far 4.6 s (was about 50), Hair treatments 2026 so far
-- 9.6 s (was a time-out), October 0.4 s. Keratin since Aug 2021 about 33 s, as before (a five-year window is mostly the
-- cost of reading and sorting every line; it needs a cache on the page, not this change). Tried and dropped: forcing
-- hash joins for the whole function (enable_nestloop off) was faster on 2026 but 83 s on the five-year window.
--
-- The live function got these in three runs the same day (1, then 2 with 3 in its first form, then 3 as written here);
-- this file is the same result as one script against the text before the change, and it stops with an error if the
-- text it expects is not there.

do $t$
declare d text; n text; i int; j int;
  a_old text; a_new text; b_old text; b_new text; c_new text;
  r1o text; r1n text; r2o text; r2n text; r3o text; r3n text; r5o text; r5n text;
begin
  d := pg_get_functiondef('public.client_mix_detail(date,date,text,text,text[],text[],text,text,integer,boolean)'::regprocedure);

  -- 1. pf
  a_old := E'  ), sl0 as materialized (\n    select p.* from p join pop0 using (k) where (case when p_any then p.family = any(array[p_fam] || coalesce(p_with, ''{}''::text[])) else p.family = p_fam end)';
  a_new := E'  ), pf as materialized (\n    select * from p where p.family = any(array[p_fam] || coalesce(p_with, ''{}''::text[]))\n  ), sl0 as materialized (\n    select pf.* from pf join pop0 using (k) where (case when p_any then pf.family = any(array[p_fam] || coalesce(p_with, ''{}''::text[])) else pf.family = p_fam end)';
  b_old := 'select x.* from p x join pop on pop.k = x.k where x.family = any(';
  b_new := 'select x.* from pf x join pop on pop.k = x.k where x.family = any(';
  if position(a_old in d) = 0 or position(b_old in d) = 0 then raise exception 'client_mix_detail: pf text not found'; end if;
  n := replace(replace(d, a_old, a_new), b_old, b_new);

  -- 2. pop0 from one pass over each client's families
  i := position('), pop0 as materialized (' in n);
  j := position('), pf as materialized (' in n);
  if i = 0 or j = 0 or j < i then raise exception 'client_mix_detail: pop0 text not found'; end if;
  c_new := E'), pop0 as materialized (\n    select k from fk group by k\n    having (case when p_any then array_agg(family) && (array[p_fam] || coalesce(p_with, ''{}''::text[]))\n                else (p_fam = any(array_agg(family)) and array_agg(family) @> coalesce(p_with, ''{}''::text[])) end)\n      and not (array_agg(family) && coalesce(p_without, ''{}''::text[]))\n  ';
  n := left(n, i - 1) || c_new || substr(n, j);

  -- 3. match clients to lines with IN (hashed once)
  r1o := 'from pf join pop0 using (k) where (case'; r1n := 'from pf where pf.k in (select k from pop0) and (case';
  r2o := E'from sl0 join pop using (k) where p_cat is null or sl0.category = any(string_to_array(p_cat, ''|''))';
  r2n := E'from sl0 where sl0.k in (select k from pop) and (p_cat is null or sl0.category = any(string_to_array(p_cat, ''|'')))';
  r3o := 'from pf x join pop on pop.k = x.k where x.family'; r3n := 'from pf x where x.k in (select k from pop) and x.family';
  r5o := 'from p x join pop on pop.k = x.k where x.family = any('; r5n := 'from p x where x.k in (select k from pop) and x.family = any(';
  if position(r1o in n) = 0 or position(r2o in n) = 0 or position(r3o in n) = 0 or position(r5o in n) = 0 then
    raise exception 'client_mix_detail: join text not found';
  end if;
  n := replace(replace(replace(replace(n, r1o, r1n), r2o, r2n), r3o, r3n), r5o, r5n);

  execute n;
end $t$;
