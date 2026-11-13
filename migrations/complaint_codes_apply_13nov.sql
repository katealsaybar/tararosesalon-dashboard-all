-- Complaint codes, part 2 (Kate, 13 Nov 2026): issue function, backfill, triggers, and the functions that read code.
-- Run after complaint_codes_13nov.sql. Everything below ran in ONE transaction, the backfill included.
-- Rule: once a row has an issued code, the code column always equals it (a trigger puts it back if anyone changes it).
-- A collision between two different clients that share branch, date, initials, last 4 digits and sequence is resolved by
-- taking the next free sequence number for that prefix (seen once in the 13 Nov backfill: two phone-less clients).
-- No names or numbers in this file.

-- issues one code, never recomputes: seq = the client's next number
create or replace function public.cmp_issue(p_kind text, p_id bigint, p_branch text, p_date date, p_name text, p_phone text,
                                            p_pid text, p_ds text, p_old text)
returns text language plpgsql security definer set search_path = '' as $$
declare key text := public.cmp_client_key(p_phone, p_pid, p_name); s int; c text;
begin
  perform pg_advisory_xact_lock(hashtext('cmpcode:' || key));
  select coalesce(max(seq), 0) + 1 into s from public.complaint_codes where client_key = key;
  loop
    c := public.cmp_code_text(p_branch, p_date, p_name, p_phone, s);
    exit when not exists (select 1 from public.complaint_codes where code = c);
    s := s + 1;
  end loop;
  insert into public.complaint_codes(code, client_key, seq, complaint_id, candidate_id, old_code, branch, cdate, date_source)
  values (c, key, s, case when p_kind = 'cc' then p_id end, case when p_kind = 'cand' then p_id end, p_old,
          coalesce(nullif(btrim(p_branch), ''), 'XX'), p_date, p_ds);
  return c;
end $$;
revoke all on function public.cmp_issue(text, bigint, text, date, text, text, text, text, text) from public, anon, authenticated;

-- BACKFILL: applies complaint_codes_plan(). Owner only. Returns counts.
create or replace function public.complaint_codes_backfill()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; c text; s int; n_cc int := 0; n_cand int := 0; bumped int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('cmpcode:backfill'));
  for r in select * from public.complaint_codes_plan() order by client_key, seq, cdate, kind, id loop
    c := r.new_code; s := r.seq;
    while exists (select 1 from public.complaint_codes where code = c) loop
      s := s + 1; bumped := bumped + 1;
      c := regexp_replace(r.new_code, '-[0-9]{3}$', '') || '-' || lpad(s::text, 3, '0');
    end loop;
    insert into public.complaint_codes(code, client_key, seq, complaint_id, candidate_id, old_code, branch, cdate, date_source)
    values (c, r.client_key, s, case when r.kind = 'cc' then r.id end, case when r.kind = 'cand' then r.id end,
            r.old_code, r.branch, r.cdate, r.date_source);
    if r.kind = 'cc' then n_cc := n_cc + 1; else n_cand := n_cand + 1; end if;
  end loop;
  update public.client_complaints x set code = k.code from public.complaint_codes k where k.complaint_id = x.id and x.code is distinct from k.code;
  update public.complaint_candidates x set code = k.code from public.complaint_codes k where k.candidate_id = x.id and x.code is distinct from k.code;
  return jsonb_build_object('client_complaints', n_cc, 'candidates', n_cand, 'collisions_bumped', bumped);
end $$;
revoke all on function public.complaint_codes_backfill() from public, anon, authenticated;

select public.complaint_codes_backfill();

-- TRIGGERS: a new complaint, or a row that becomes a complaint, gets its code automatically. Nobody types a code.
create or replace function public.cmp_code_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text; d date; ds text; ph text;
begin
  select k.code into c from public.complaint_codes k where k.complaint_id = new.id;
  if c is not null then new.code := c; return new; end if;
  if new.duplicate_of is null and (new.is_complaint or new.submitted_at is not null) then
    d := coalesce(new.complaint_date, new.event_date, (new.submitted_at at time zone 'Asia/Dubai')::date, (coalesce(new.created_at, now()) at time zone 'Asia/Dubai')::date);
    ds := case when new.complaint_date is not null then 'complaint_date' when new.event_date is not null then 'event_date'
               when new.submitted_at is not null then 'submitted' else 'created' end;
    ph := public.cmp_phone_of(new.phorest_id, new.client_phone);
    new.code := public.cmp_issue('cc', new.id, new.branch_code, d, new.client_name, ph, new.phorest_id, ds,
                                 case when new.code like 'CMP-%' then new.code end);
  end if;
  return new;
end $$;

create or replace function public.cmp_cand_code_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text; d date; ds text;
begin
  select k.code into c from public.complaint_codes k where k.candidate_id = new.id;
  if c is not null then new.code := c; return new; end if;
  if new.status = 'confirmed' then
    d := coalesce(new.msg_date, (new.decided_at at time zone 'Asia/Dubai')::date, (coalesce(new.created_at, now()) at time zone 'Asia/Dubai')::date);
    ds := case when new.msg_date is not null then 'msg_date' else 'decided' end;
    new.code := public.cmp_issue('cand', new.id, new.branch_code, d, new.client_name, nullif(btrim(coalesce(new.phone, '')), ''), new.phorest_id, ds, null);
  end if;
  return new;
end $$;

drop trigger if exists client_complaints_code_trg on public.client_complaints;
create trigger client_complaints_code_trg before insert or update on public.client_complaints
  for each row execute function public.cmp_code_trg();
drop trigger if exists complaint_candidates_code_trg on public.complaint_candidates;
create trigger complaint_candidates_code_trg before insert or update on public.complaint_candidates
  for each row execute function public.cmp_cand_code_trg();

-- cmp_find: exact code, ignoring punctuation and case; also the old CMP- code (alias)
create or replace function public.cmp_find(p_code text) returns bigint
language sql stable security definer set search_path = '' as $$
  with q as (select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g') as n)
  select coalesce(
    (select c.id from public.client_complaints c, q where c.code is not null
        and regexp_replace(upper(c.code), '[^A-Z0-9]', '', 'g') = q.n limit 1),
    (select k.complaint_id from public.complaint_codes k, q where k.complaint_id is not null
        and (regexp_replace(upper(k.code), '[^A-Z0-9]', '', 'g') = q.n
             or regexp_replace(upper(coalesce(k.old_code, '')), '[^A-Z0-9]', '', 'g') = q.n) limit 1))
$$;

-- patches by exact replacement of the live definition, each checked (it raises if the text was not found)
do $$
declare d text; o text;
begin
  -- cmp_get: "other complaints from the same client" meant ones logged on the form, which used to be the ones with a code
  d := pg_get_functiondef('public.cmp_get(bigint)'::regprocedure); o := d;
  d := replace(d, 'd.id <> p_id and d.code is not null', 'd.id <> p_id and d.src_logged');
  if d = o then raise exception 'cmp_get: text not found'; end if;
  execute d;

  -- client_complaints_list: a partial code (4 characters or more, punctuation ignored) also finds the old CMP- code
  d := pg_get_functiondef('public.client_complaints_list(text,text,text,text,text,boolean,integer,integer,text,text,text,date,date,text,text,bigint)'::regprocedure); o := d;
  d := replace(d, $x$or (length(qc) >= 4 and regexp_replace(lower(coalesce(h.code, '')), '[^a-z0-9]', '', 'g') like '%' || qc || '%'))$x$,
                  $x$or (length(qc) >= 4 and (regexp_replace(lower(coalesce(h.code, '')), '[^a-z0-9]', '', 'g') like '%' || qc || '%'
                        or exists (select 1 from public.complaint_codes kk where kk.complaint_id = h.id
                                   and regexp_replace(lower(coalesce(kk.old_code, '')), '[^a-z0-9]', '', 'g') like '%' || qc || '%'))))$x$);
  if d = o then raise exception 'client_complaints_list: text not found'; end if;
  execute d;

  -- complaint_candidates_list: returns the code and searches it
  d := pg_get_functiondef('public.complaint_candidates_list(text,text,text)'::regprocedure); o := d;
  d := replace(d, $x$'link_id', c.link_id,$x$, $x$'code', c.code, 'link_id', c.link_id,$x$);
  d := replace(d, $x$coalesce(c.phone, ''))) > 0)$x$,
                  $x$coalesce(c.phone, ''))) > 0
           or (length(regexp_replace(q, '[^a-z0-9]', '', 'g')) >= 4
               and regexp_replace(lower(coalesce(c.code, '')), '[^a-z0-9]', '', 'g') like '%' || regexp_replace(q, '[^a-z0-9]', '', 'g') || '%'))$x$);
  if d = o or position('''code'', c.code' in d) = 0 or position('c.code, '''')' in d) = 0 then raise exception 'complaint_candidates_list: text not found'; end if;
  execute d;
end $$;
