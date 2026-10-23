-- Marketing Spend, the agency line (Kate, 23 Oct 2026). Applied live 23 Oct 2026 after marketing_spend.sql.
-- Leaders in Digital's monthly fee for the UAE salons, before VAT, from their invoices (Downloads, WEBSITE AUDIT/LID) and
-- Dawn Kubicek's emails of 18 May, 6 Jul and 27 and 31 Aug 2026. Bahrain's invoices are left out (it is not trading yet).
-- April is the three entities' invoices together (the first Abu Dhabi invoice 2030 for 22,500 was reissued as 12,500 and two
-- of 5,000). May's paid media (10,000) was covered by LiD. September's invoices (2134 to 2136, read from Gemma Nye's email of 23 Sep) came to 25,000. LID was taken off in October 2026, so October is 0 until a final invoice, if any, comes.
-- marketing_spend_report() now returns agency for each month; the page adds it to the cost per new client where it is known.
create table if not exists agency_fees (
  month       date    not null,
  agency      text    not null,
  amount_aed  numeric not null,   -- before VAT, UAE salons only
  note        text,
  loaded_at   timestamptz not null default now(),
  primary key (month, agency)
);
alter table agency_fees enable row level security;   -- no policies: read through marketing_spend_report only

insert into agency_fees (month, agency, amount_aed, note) values
 ('2025-10-01','Leaders in Digital',20000,'Invoice 1892: SEO and CRM, 10,000 each'),
 ('2025-11-01','Leaders in Digital',20000,'Invoice 1911: SEO and CRM, 10,000 each'),
 ('2025-12-01','Leaders in Digital',20000,'Invoice 1934: SEO and CRM, 10,000 each'),
 ('2026-01-01','Leaders in Digital',20000,'Invoice 1958: CRM and website, 10,000 each'),
 ('2026-02-01','Leaders in Digital',20000,'Invoice 1984: CRM and paid media, 10,000 each'),
 ('2026-03-01','Leaders in Digital',20000,'Invoice 2007: CRM and paid media, 10,000 each'),
 ('2026-04-01','Leaders in Digital',22500,'Invoices 2030 (12,500), 2035 (5,000), 2036 (5,000): CRM, paid media, website maintenance'),
 ('2026-05-01','Leaders in Digital',20000,'18 May email: SEO and CRM 10,000 each; paid media 10,000 covered by LiD'),
 ('2026-06-01','Leaders in Digital',30000,'6 Jul email: 31,500 with VAT across three entities'),
 ('2026-07-01','Leaders in Digital',30000,'6 Jul email: 31,500 with VAT across three entities'),
 ('2026-08-01','Leaders in Digital',20000,'31 Aug email, amended: 10,000 + 5,000 + 5,000'),
 ('2026-09-01','Leaders in Digital',25000,'Invoices 2134 (12,500), 2135 (6,250), 2136 (6,250): CRM, paid media, website maintenance; 2133 is Bahrain, left out'),
 ('2026-10-01','Leaders in Digital',0,'LID was taken off in October 2026 (Kate, 23 Oct). No October invoice; update if a final one comes.')
on conflict (month, agency) do nothing;

-- marketing_spend_report() in marketing_spend.sql now reads this table (an 'agency' field on each month and
-- 'agency_last_month' at the top); run that file after this one. Both are applied live.
