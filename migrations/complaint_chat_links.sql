-- Which respond.io contact is the client of a complaint (Kate, 12 Nov 2026). Found by phone, a link is not needed. Found only by name (Google reviews, Instagram, Facebook have no phone),
-- a person confirms "Yes, this is her" once and it is remembered here, so the Conversation tab does not ask again. Levels 3 and up, checked in each function.
-- The table holds only the contact's number in respond.io and who confirmed it, no names and no messages.
create table if not exists public.complaint_chat_links (
  complaint_id       bigint primary key references public.client_complaints(id) on delete cascade,
  respond_contact_id bigint not null,
  confirmed_by       text,
  confirmed_at       timestamptz not null default now()
);
alter table public.complaint_chat_links enable row level security;   -- no policies: read and written through the two functions below only

create or replace function public.complaint_chat_link_get(p_id bigint) returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Conversations are for Levels 3 and up'; end if;
  return (select l.respond_contact_id from public.complaint_chat_links l where l.complaint_id = p_id);
end $$;

-- p_contact null takes the link away ("Not her", or a wrong confirmation).
create or replace function public.complaint_chat_link_set(p_id bigint, p_contact bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Conversations are for Levels 3 and up'; end if;
  if p_contact is null then
    delete from public.complaint_chat_links where complaint_id = p_id;
  else
    insert into public.complaint_chat_links (complaint_id, respond_contact_id, confirmed_by)
    values (p_id, p_contact, (select auth.jwt() ->> 'email'))
    on conflict (complaint_id) do update set respond_contact_id = excluded.respond_contact_id, confirmed_by = excluded.confirmed_by, confirmed_at = now();
  end if;
end $$;

revoke all on function public.complaint_chat_link_get(bigint), public.complaint_chat_link_set(bigint, bigint) from public, anon;
grant execute on function public.complaint_chat_link_get(bigint), public.complaint_chat_link_set(bigint, bigint) to authenticated;
