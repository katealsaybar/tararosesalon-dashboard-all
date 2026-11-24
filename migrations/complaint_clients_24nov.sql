-- One row per client with a complaint, with a complete and checked identity (Kate, 24 Nov 2026: "match all clients to complaints accurately").
-- Applied live on 24 Nov 2026: 1,233 clients (1,157 with a Client Complaints record or a chat candidate matched to Phorest, plus chat candidates with no Phorest client yet).
-- Sits beside client_complaints and complaint_candidates and changes neither. RLS on, no policies: read and written by the service role (the edge function complaint-client-match) only.
-- email = the real Phorest email, else a respond.io email only when the phone found the contact exactly, the phone is not shared and the names agree.
-- gaps lists what is still missing or doubtful: no phone, no email, not in Phorest list, archived in Phorest, phone shared with another client,
-- name differs in respond.io, no respond.io contact, respond.io email not confirmed, email differs (Phorest vs respond.io).
-- Result on 24 Nov 2026: 638 complete, 676 with an email (549 Phorest, 127 respond.io), 557 with no email anywhere, 37 with no phone, 22 Phorest ids not in the client list.
-- Undo: drop table public.complaint_clients;
create table if not exists public.complaint_clients (
  client_key         text primary key,     -- the Phorest id; 'cand:<id>' for a chat complaint with no Phorest client yet
  phorest_id         text,
  name               text,
  phone              text,
  email              text,
  email_source       text,                 -- phorest | respond.io | null
  email_phorest      text,
  email_respond      text,
  respond_contact_id bigint,
  respond_name       text,
  name_check         text,                 -- same | similar | different | no name | no respond.io contact
  phone_shared       boolean not null default false,   -- another live Phorest client holds the same number
  in_phorest         boolean not null default false,   -- the Phorest id is in the client directory
  archived           boolean,
  complaints         int not null default 0,
  chat_candidates    int not null default 0,
  gaps               text,
  checked_at         timestamptz,
  updated_at         timestamptz not null default now()
);
alter table public.complaint_clients enable row level security;

-- The Phorest side, filled once by SQL. The respond.io side is added by the edge function complaint-client-match
-- (POST {"limit": 600} until still_to_check is 0; {"force": true} re-checks rows already checked).
with ids as (select phorest_id, count(*)::int n from public.client_complaints where is_complaint and duplicate_of is null group by 1),
cand as (select phorest_id, count(*)::int n from public.complaint_candidates where phorest_id is not null group by 1),
allids as (select coalesce(a.phorest_id, b.phorest_id) pid, coalesce(a.n, 0) cn, coalesce(b.n, 0) kn from ids a full join cand b on a.phorest_id = b.phorest_id),
pe as (select distinct on (phorest_id) phorest_id, nullif(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') nm, nullif(mobile_norm,'') ph, archived
         from public.phorest_client_emails order by phorest_id, pulled_at desc nulls last),
re as (select phorest_id, (array_agg(lower(btrim(email)) order by pulled_at desc nulls last))[1] email
         from public.phorest_client_emails where email_status = 'real' and email is not null and btrim(email) <> '' group by 1),
sh as (select mobile_norm from public.phorest_client_emails where mobile_norm is not null and mobile_norm <> '' and not coalesce(archived, false) group by 1 having count(distinct phorest_id) > 1),
cc as (select distinct on (phorest_id) phorest_id, client_name, nullif(btrim(client_phone), '') client_phone from public.client_complaints where phorest_id is not null order by phorest_id, event_date desc nulls last)
insert into public.complaint_clients (client_key, phorest_id, name, phone, email_phorest, email, email_source, in_phorest, archived, phone_shared, complaints, chat_candidates)
select a.pid, a.pid, coalesce(pe.nm, cc.client_name), coalesce(pe.ph, cc.client_phone), re.email, re.email, case when re.email is not null then 'phorest' end,
       pe.phorest_id is not null, pe.archived, coalesce(pe.ph in (select mobile_norm from sh), false), a.cn, a.kn
from allids a left join pe on pe.phorest_id = a.pid left join re on re.phorest_id = a.pid left join cc on cc.phorest_id = a.pid
where a.pid is not null
on conflict (client_key) do nothing;

-- Chat complaints no Phorest client has been found for yet.
insert into public.complaint_clients (client_key, name, phone, email_respond, respond_contact_id, in_phorest, chat_candidates)
select 'cand:' || c.id, c.client_name, c.phone, c.email, c.respond_contact_id, false, 1
from public.complaint_candidates c where c.phorest_id is null
on conflict (client_key) do nothing;
