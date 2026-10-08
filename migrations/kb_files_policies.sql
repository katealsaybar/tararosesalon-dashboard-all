-- Kate, 8 Oct 2026: the Booking & Deposit Policy joins HR Forms & Waivers as a fourth group,
-- "Policies" (/hub/forms). Four rows: the approved staff guide v3 and the team memo (28 Sep 2026)
-- as PDFs, and two links to the live client page on promo.tararosesalon.com (a link row has an
-- href and no pdf). Already applied to Supabase; the two PDFs went in through a one-time loader
-- RPC (random name, granted to anon, dropped right after). Source: Downloads/deposit-policy/.
alter table public.kb_files add column if not exists href text;

-- DP-01 and DP-02 (PDFs) were loaded by the loader. DP-03 and DP-04 are links:
insert into public.kb_files (code, section, grp, title, subtitle, blurb, filename, sort, href) values
  ('DP-03', 'hr-forms', 'Policies', 'Booking & Deposit Policy', 'Client page, new clients',
   'What a new client sees. Send her this link.', 'deposit-policy-new-client', 230,
   'https://promo.tararosesalon.com/deposit-policy?client=new'),
  ('DP-04', 'hr-forms', 'Policies', 'Booking & Deposit Policy', 'Client page, existing clients',
   'What an existing client sees. Send her this link.', 'deposit-policy-existing-client', 240,
   'https://promo.tararosesalon.com/deposit-policy?client=existing')
on conflict (code) do nothing;
