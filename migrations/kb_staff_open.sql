-- Kate, 2 Oct 2026: the stylist page (performance/) shows its Team Home links to a
-- signed-out stylist only once Team Home is open to staff. This answers just that
-- one yes/no for the anon key; nothing else in kb_settings is readable.
create or replace function public.kb_staff_open()
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select coalesce((select on_off from public.kb_settings where key = 'staff_open'), false)
$$;
revoke all on function public.kb_staff_open() from public;
grant execute on function public.kb_staff_open() to anon, authenticated;
