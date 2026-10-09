-- Lost Clients: fold a name Phorest stored twice (Kate, 9 Oct 2026). Already applied; this is the record.
-- Sales Transactions sometimes carries a client twice in one field ("Anika Berger Anika Berger", about 425
-- clients since 2025, a few more every week). The functions keyed clients on the plain name, so such a client
-- looked lost under one spelling while active under the other, and found no phone number. Checked 9 Oct:
-- 173 of the 322 doubled names that looked lost had an active normal spelling.
--
-- Each function is patched in place: its own definition is read, the spots that key on a name are swapped for
-- stl_key_fold (migrations/lost_lists.sql), and it is recreated. stl_client_key itself is left alone because
-- functional indexes use it. Effect on the numbers (90 days, every branch): came once 5,232 to 4,882, came
-- twice 1,821 to 1,805, regulars 2,704 to 2,703; Saadiyat, all visits, 4,164 to 4,015.
do $mig$
declare d text; d0 text; fn text;
  procedure_names text[] := array['lost_clients','lost_clients_summary','lost_client_detail','lost_clients_detail_bulk'];
begin
  foreach fn in array procedure_names loop
    select pg_get_functiondef(p.oid) into d0 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn;
    d := d0;
    if fn = 'lost_clients' then
      d := replace(d, 'lower(name) as k', 'public.stl_key_fold(name) as k');
      d := replace(d, 'max(name) as name from nm0', '(array_agg(name order by length(name), name))[1] as name from nm0');
      d := replace(d, 'select public.stl_client_key(s.client_name) as k,', 'select public.stl_key_fold(s.client_name) as k,');
      d := replace(d, 'select distinct on (b2.client_key) b2.client_key as k,', 'select distinct on (public.stl_key_fold(b2.client_key)) public.stl_key_fold(b2.client_key) as k,');
      d := replace(d, 'order by b2.client_key, b2.date,', 'order by public.stl_key_fold(b2.client_key), b2.date,');
      d := replace(d, 'select distinct on (c2.client_key) c2.client_key as k,', 'select distinct on (public.stl_key_fold(c2.client_key)) public.stl_key_fold(c2.client_key) as k,');
      d := replace(d, 'order by c2.client_key, c2.updated_at desc', 'order by public.stl_key_fold(c2.client_key), c2.updated_at desc');
    elsif fn = 'lost_clients_summary' then
      d := replace(d, 'lower(name) as k', 'public.stl_key_fold(name) as k');
      d := replace(d, 'join kk on kk.k = cb.client_key', 'join kk on kk.k = public.stl_key_fold(cb.client_key)');
    elsif fn = 'lost_client_detail' then
      d := replace(d, 'names text[] := public.stl_names_for_key(public.stl_client_key(p_client));',
        'names text[] := public.stl_names_for_key(public.stl_client_key(p_client)) || public.stl_names_for_key(public.stl_client_key(p_client) || '' '' || public.stl_client_key(p_client));');
    else
      d := replace(d, 'join want w on public.stl_client_key(s.client_name) = w.k', 'join want w on public.stl_client_key(s.client_name) in (w.k, w.k || '' '' || w.k)');
    end if;
    if d = d0 then raise exception 'nothing changed in %', fn; end if;
    execute d;
  end loop;
end
$mig$;
