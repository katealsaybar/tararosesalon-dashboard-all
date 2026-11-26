-- Out of Stock, Claude's picks of which colour products the booked colour services will possibly use (Kate, 26 Nov 2026).
--
-- STATUS: APPLIED on 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_product_ai), on Kate's word.
-- One row per salon and per product list (a hash of the plan's colour product keys and the model), written only by the edge function oos-products
-- (supabase/functions/oos-products/index.ts) with the service role. Nobody else can read or write it: row level security is on and there is no policy.
-- The answer is Claude's estimate from product names. It is NOT a measured recipe: Phorest does not record which client a tube was used on.

create table if not exists public.oos_product_ai (
  salon         text        not null,
  list_hash     text        not null,
  model         text        not null,
  result        jsonb       not null,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now(),
  primary key (salon, list_hash)
);
alter table public.oos_product_ai enable row level security;
revoke all on public.oos_product_ai from anon, authenticated;
