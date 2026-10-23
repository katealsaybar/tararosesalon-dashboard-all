-- Marketing Spend, Bahrain and other costs (Kate, 23 Oct 2026). Applied live 23 Oct 2026 after marketing_spend_cache.sql.
-- Bahrain is in the numbers: its first sales lines are 13 Aug 2026 (branch BAH) and the new-client count already includes them,
-- so Leaders in Digital's Bahrain fees count too. Amounts before VAT (Bahrain invoices are zero rated): January 3,000
-- (invoice 1963, revised and paid), February 3,000 (Dawn Kubicek's 6 Jul email keeps it on file until Bahrain trades; the March
-- invoices 1965 and 2008 were not charged), September 4,500 (invoice 2133). Not counted: the 20,000 Bahrain website build, which
-- LiD has not billed and parked until the salon trades.
-- other_marketing_costs holds what is not an ad account or the agency. category 'meta' is added to the Meta column (Instagram
-- boosts paid from a second Meta account, 169841546060598: 364.00 on 20 Dec 2025, 82.32 on 4 Aug 2026); any other category shows
-- in an Other column on the page. It is where respond.io, GHL and Phorest go once their totals are known.
create table if not exists other_marketing_costs (
  month       date    not null,
  category    text    not null,
  item        text    not null,
  amount_aed  numeric not null,
  note        text,
  loaded_at   timestamptz not null default now(),
  primary key (month, category, item)
);
alter table other_marketing_costs enable row level security;   -- no policies: read through marketing_spend_report only

insert into other_marketing_costs (month, category, item, amount_aed, note) values
 ('2025-12-01','meta','Instagram boost, second Meta account 169841546060598',364.00,'Meta funds receipt 20 Dec 2025 (info@)'),
 ('2026-08-01','meta','Instagram boost, second Meta account 169841546060598',82.32,'Meta funds receipt 4 Aug 2026 (info@)')
on conflict (month, category, item) do nothing;

insert into agency_fees (month, agency, amount_aed, note) values
 ('2026-01-01','Leaders in Digital Bahrain',3000,'Invoice 1963 (revised, paid): paid media'),
 ('2026-02-01','Leaders in Digital Bahrain',3000,'6 Jul email: Feb paid media 3,000, kept on file until Bahrain trades; March not charged'),
 ('2026-09-01','Leaders in Digital Bahrain',4500,'Invoice 2133: Instagram and Meta ads management')
on conflict (month, agency) do nothing;

-- marketing_spend_report() (in marketing_spend_cache.sql) reads both tables.
