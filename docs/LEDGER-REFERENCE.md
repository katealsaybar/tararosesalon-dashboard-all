# The Monday Target Sheet — structure and computation

What the ledger actually is, so Branch Performance and Emma's view can be built
against it rather than guessed at. Read from **08 AUG 2026 TARGET SHEET**
(`1x2qgYYxbxRLDnMBjvZ2G_cnDLLaO6jlPk7RSW_zYGqE`) on 14 Aug 2026, in the
`MONDAY TARGET SHEET` folder of the shared `LEDGERS` drive.

Sibling files in that folder, not read here but worth knowing about:
`LEDGERS-daily/`, `MTD FORMAT/`, `daily ledgers output` (1 MB), and the
May / June / July target sheets. One target sheet per month, same shape.

## Tabs

| Tab | Role |
|---|---|
| `SUMMARY` | Group + per-branch roll-up, and the MTD pacing panel |
| `Daily Stylist Target` | Every stylist, target vs MTD actual, by branch and dept |
| `SAA` `KCA` `MC` `AQ` | One tab per branch: revenue, clients, benchmarks, staff |
| `0YEAR` `0STYLIST_DATA` `0REF` `0PHOREST` `0PHORESTJUL` `0scratch` | Source and helper tabs. `0`-prefixed = not for reading |

Everything is **EX VAT**. Every tab carries a `Last Ledgers Import: <ts> UAE`
stamp — the dashboard's own freshness badge is the equivalent.

> Reading these tabs programmatically: the gviz CSV endpoint
> (`/gviz/tq?tqx=out:csv&sheet=<name>`) auto-joins the sheet's **two** header
> rows into one, so parsed row `i` is sheet row `i + 2`. Merged header cells
> collapse, which is why some column labels look like they've been concatenated.

## The column model

Both `SUMMARY` and the four branch tabs run the same columns. This is the shape
the dashboard's detail view was missing — it only ever showed a single period.

| Col | Meaning |
|---|---|
| A | Category / Metric |
| B | **Last Month** — previous month's actual (July 2026) |
| C | **This Month** — the target (August 2026) |
| D–I | Week 00 … Week 04, then the odd trailing day. Aug: `1–2`, `3–9`, `10–16`, `17–23`, `24–30`, `31` |
| J | **MTD** — `1 Aug – 31 Aug`, the sum of the week columns |
| K | **Variance** — `MTD − target`. Negative is behind |

Weeks are **Monday-start** calendar weeks clipped to the month, so the first and
last "weeks" are usually part-weeks. Week 00 is the fragment before the first
full week. (This line said Sunday-start until 14 Aug; the August columns above
disprove it — 1 Aug 2026 is a Saturday, so a Sunday-start week 1 would run 2–8,
not the 3–9 the sheet shows. `lgMonthWindows()` in `branch-ledger.js` derives
them from the month rather than hard-coding, so September needs no edit.)

## SUMMARY

### Left block — the roll-up

`GROUP TOTAL — ALL SALONS`, then one section per branch in sheet order
**SAADIYAT · KHALIFA · AL QUOZ · MOTOR CITY**. Each section is:

- **Revenue** — Services Total · Retail Total · Hair services (incl. treatments
  and courses) · Hair services (excl. treatments) · Treatments revenue ·
  Beauty services · Hair Retail · Beauty Retail
- **Clients** — Beauty Rebooked · Rebooked · Total Clients · New Clients · NCR
- **Benchmarks** — Rebooking % · Treatment % · Retail % · Hair Avg Bill ·
  Beauty Avg Bill

Group total adds `Total services revenue` / `Total retail revenue` above the
split, and its benchmark rows are labelled `(group avg)` — they are weighted
averages, not the mean of the four branch figures.

**Motor City carries a reduced set** (no beauty rows at all): Hair services
excl. treatments · Treatments revenue · Retail Total · Rebooked · Total Clients ·
New Clients · NCR, then benchmarks without Beauty Avg Bill. It runs hair only,
which the dashboard already models as `hair-only`.

### Right block — the MTD pacing panel

Headed `Daily target sheet · MTD`. First a per-branch benchmark pivot:

`Branch | Rebooking % | Treatment % | Retail % | Hair Avg Bill | Beauty Avg Bill | Total Client | New Client | … | …`

rows SAADIYAT · KHALIFA · MOTOR CITY · AL QUOZ · **Grand Total**.

Then **six pacing blocks** in a 3 × 2 grid, all sharing one header:

`Branch | Target | MTD Actual | Variance | % Done | Remaining`

|  |  |  |
|---|---|---|
| SALON TOTAL SERVICES | SALON TOTAL RETAIL | HAIR TREATMENT |
| HAIR SERVICES (excluding Treatments) | HAIR RETAIL | BEAUTY SERVICES |

with the same four branches plus Grand Total. This is the coaching view:

```
Variance  = MTD Actual − Target        (negative = behind)
% Done    = MTD Actual ÷ Target
Remaining = Target − MTD Actual        (what's left to find this month)
```

`% Done` is deliberately *not* compared against elapsed-days pace anywhere in
the sheet — it is raw progress through the target. Worth keeping that way, or
Emma's numbers stop matching her sheet.

## Daily Stylist Target

One row per stylist, grouped **branch → dept**, each group closed by a `TOTALS`
row. Order: SAADIYAT hair, SAADIYAT beauty, KHALIFA hair, KHALIFA beauty,
AL QUOZ hair, AL QUOZ beauty, MOTOR CITY hair (no beauty).

| Group | Columns |
|---|---|
| — | Branch · Nickname · Dept |
| SERVICES | Services Target · MTD Actual · Variance |
| CLIENTS | Total Client · New Client · NCR · Rebooked · Rebooked % · Hair Avg Bill |
| TREATMENT | Treatment Target · MTD Actual · **Unit** · Treatment % · Variance |
| RETAIL | Retail Target · MTD Actual · **Unit** · Retail % · Variance |

`Unit` is the count of treatments / retail items sold, next to its revenue.
Stylists are listed by **nickname**, which is what the dashboard's
`canonicalStaffName()` resolves to once upper-cased — `Lucia` folds into `LUCY`,
`Edz`/`Eds` into `EDS`. Nicknames repeat across branches (Chalani at both KCA and
MC; MJ and Shine appear under both hair and beauty at AQ), so a stylist target
key must be branch + dept + name, never name alone.

## Branch tabs (SAA · KCA · MC · AQ)

Same column model as SUMMARY. Four blocks:

1. **Revenue** — Services Total · Retail Total · Hair services (incl.) ·
   Hair services (excl.) · Treatments revenue · Beauty services · Hair Retail ·
   Beauty Retail
2. **Clients** — Hair Total / New / NCR · Beauty Total / New / NCR ·
   Hair Rebooked · Beauty Rebooked · Rebooked · Total Clients · New Clients · NCR
3. **Benchmarks** — Rebooking % · Treatment % · Retail % · Hair Avg Bill ·
   Beauty Avg Bill
4. **Staff performance** — per stylist, name then role, then Rebooking % ·
   Treatment % · Retail % · Avg Bill · Hair services (excl. treatments) ·
   Treatments revenue · Retail revenue · **Net Salon Take** · Rebooked ·
   Total Clients · New Clients · NCR

Block 2 is the useful one: the branch tabs split every client metric by dept
before totalling, where SUMMARY only carries the total. The dashboard already
computes both sides of that split.

## How this maps to what the dashboard already has

The metric vocabulary matches almost exactly — the ledger's names and
`aggData()`'s fields are the same quantities:

| Ledger row | Dashboard field |
|---|---|
| Services Total | `s.servicesTotal` |
| Retail Total | `s.retailTotal` |
| Hair services (incl. treatments and courses) | `s.hairServicesIncl` |
| Hair services (excl. treatments) | `s.hairServicesExcl` |
| Treatments revenue | `s.treatmentSales` |
| Beauty services | `s.beautyServicesTotal` |
| Hair Retail / Beauty Retail | `s.hairRetailOnly` / `s.beautyRetailOnly` |
| Total / New / NCR (hair) | `s.hairTotalClients` / `s.hairNewClients` / `s.hairNCR` |
| Total / New / NCR (beauty) | `s.beautyTotalClients` / `s.beautyNewClients` / `s.beautyNCR` |
| Rebooked | `s.totalRebooked`, split `s.hairRebookedCount` / `s.beautyRebookedCount` |
| Hair / Beauty Avg Bill | `s.hairAvgBill` / `s.beautyAvgBill` |

The ledger's benchmark **targets** also already agree with `TARGETS` in
`dashboard.js:12` — Treatment 20 %, Retail 12 %, Hair Avg Bill 650, Beauty Avg
Bill 200. Rebooking is the one difference: 45 % per branch, shown as a 44 %
group average.

**What the dashboard did not have is the revenue targets** — the whole
Target / Variance / % Done / Remaining spine. Those are now in
`ledger-targets.js`, read out of this sheet. That file is a monthly hand-update,
same as `TARGETS`; if the numbers drift from Emma's sheet, that file is why.
