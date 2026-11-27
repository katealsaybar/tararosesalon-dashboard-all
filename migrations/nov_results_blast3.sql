-- November Results, Blast 3 column (Kate, 27 Nov 2026: "lagyan mo na to ng data kahit wala pang na benta"). APPLIED LIVE 27 Nov 2026.
-- nov_results_core: the booking, paid and clients figures per blast (money) now also cover the Blast 3 blasts (ids T_), as they do for Blast 2 (ids R_):
-- a client's figures come from nov_client_facts (her first message), joined to the clients the T_ message was sent to. Delivery figures (sent, read, delivered, failed, STOP)
-- already covered every blast id. js/nov-blasts.js: the By blast section draws a Blast 3 column beside Blast 1 and Blast 2 for the five audiences that had one.
-- Rollback: nov_results_core_pre_blast3_27nov holds the previous text.
do $do$
declare d text; n text;
begin
  if not exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = 'nov_results_core_pre_blast3_27nov') then
    execute replace(pg_get_functiondef('public.nov_results_core()'::regprocedure), 'FUNCTION public.nov_results_core(', 'FUNCTION public.nov_results_core_pre_blast3_27nov(');
    revoke all on function public.nov_results_core_pre_blast3_27nov() from public, anon, authenticated;
  end if;
  d := pg_get_functiondef('public.nov_results_core()'::regprocedure);
  if position('~ ''^[RT]_''' in d) > 0 then return; end if;
  n := d;
  n := replace(n, 'having blast_id is null or blast_id not like ''R\_%''', 'having blast_id is null or blast_id !~ ''^[RT]_''');
  n := replace(n, 'from s where blast_id like ''R\_%'') rj', 'from s where blast_id ~ ''^[RT]_'') rj');
  if n = d or position('blast_id !~ ''^[RT]_''' in n) = 0 or position('where blast_id ~ ''^[RT]_''' in n) = 0 then raise exception 'nov_results_core patch failed'; end if;
  execute n;
end $do$;
