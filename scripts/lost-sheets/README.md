# Lost Clients reception Sheets (12 Oct 2026)

**Where things live (14 Oct 2026):** this script and README are in the dashboard repo (`scripts/lost-sheets`), moved from the cowork folder. The repo is public, so the private runtime files stay in the cowork folder, `phorest data export/lost review sheets/` (gitignored there): `token.json`, `state.json`, `sheets.json`, `added.json`, `sync.log`. The push helper and `.push-pass` stay in `phorest data export` / `stock orders` (set `TRS_COWORK_DIR` to point at another cowork folder). The two Windows tasks run the script from the dashboard checkout and still write `sync.log` in the data folder; run it from the local `main` checkout, never from a stale branch.

Reception cannot open the dashboard (taken off `dashboard_users` on 3 Oct) but answers most replies and knows who is a regular. Each branch gets a Google Sheet of its lost clients with a **Take out?** dropdown (Visiting regularly, Stylist knows her, Do not contact, Wrong number, Other). A client taken out on a Sheet is out of every group, To message, Copy numbers and the files, the same as if a coordinator had taken her out on the Lost Clients page (`lost_excluded`, set by "Sheet: <branch> reception").

Database half: `migrations/lost_sheet.sql` in the dashboard repo (`lost_sheet_rows`, `lost_sheet_apply`, push-pass gated; `lost_lists_core_x`). Applied live 12 Oct 2026.

## Set up once

```powershell
cd "D:\WORK\Claude\claude-cowork-build\tararosesalon-dashboard-all-main\scripts\lost-sheets"
py lost_review_sheets.py auth      # browser opens: sign in with the work Google account, allow Sheets
py lost_review_sheets.py create    # four sheets, filled; links go in sheets.json
```

The Google app ("Tara Rose Dashboard") is in Testing mode, so Google says "unverified app": Advanced, Continue. The sign-in is separate from the gmail-multi server (its own `token.json` here, Sheets scope only).

Then **Kate shares each sheet** with that branch's reception (Editor). The script never shares anything and never puts phone numbers in a sheet.

## Scheduled sync

Windows task **TRS lost clients sheets sync** runs `sync` every 15 minutes from 07:00 to 23:00 while Kate is signed in (about 10 seconds a run, log in `sync.log`, last line `exit 0`). Manage it in Task Scheduler or `Get-ScheduledTask 'TRS lost clients sheets sync' | Get-ScheduledTaskInfo`; `Disable-ScheduledTask` pauses it. It calls the real python (`C:\Users\user\AppData\Local\Python\pythoncore-3.14-64\python.exe`), like the bookings sync.

Sheets made 12 Oct 2026 (links in `sheets.json`, not in git). Round trip tested on the AQ sheet: a reason typed in Take out? reached `lost_excluded` as "Sheet: Al Quoz reception", and clearing the cell removed it.

**Next appointment and Status follow the bookings sync** (18 Oct 2026, Kate: "dapat auto-update din yun"): the bookings sync runs 6 times a day (07, 10, 13, 16, 19, 22) but `update` only ran at 06:30, so a booking made in the day reached the sheet the next morning and a booked client still said In the blast (18 Oct: 11 booked clients blank, 9 wrongly In the blast, 2 cancelled bookings still showing). The refresh task now also runs `update` at 07:20, 10:20, 13:20, 16:20, 19:20 and 22:20, 20 minutes after each bookings sync (a sync takes about 2 minutes); `update` touches only the columns it always did, never client names, Take out? or Note. After one run the four sheets matched the database exactly.

A second task, **TRS lost clients sheets refresh**, runs `refresh` every morning at 06:30 (sync first, then the rows are rewritten from the database: new bookings, new clients, who has been taken out on the dashboard). `StartWhenAvailable` is on, so a morning the PC was off runs when it is next on.

The dashboard's Lost Clients page opens these sheets from **Open in Google Sheets** (one per branch). The links are in the database table `lost_sheet_links` (migrations/lost_sheet_links.sql), because the page cannot read `sheets.json`; if a sheet is ever recreated, update that row. There is no Excel review file and no upload any more (12 Oct 2026): one live copy, on the sheet.

**Both directions every 15 minutes** (12 Oct 2026). The sync reads the sheet and applies what was typed on it to the dashboard; then it looks at who is taken out on the dashboard (`lost_sheet_labels`) and writes any change into just that client's Take out? and Note cells on the sheet, without rewriting it. A cell edited on the sheet since the last sync is never overwritten: the sheet wins that one. A client put back on the dashboard has her sheet cells cleared. Tested on the Al Quoz sheet: taken out on the dashboard (appeared on the sheet), put back (cleared), and a simultaneous edit (the sheet won).

**The daily upkeep no longer rewrites the sheet** (12 Oct 2026: someone may already be editing). The 06:30 task now runs `update`: after a sync it refreshes only Last visit, Last service, Usual stylist / beautician, Next appointment and Status of the rows already there, matched by the hidden client key; client names (column A) and Take out? / Note are never touched, no row is removed or moved, a client the database no longer lists keeps her row and says "Off the list now (not messaged)", and a client who has joined the lists since is added at the bottom with Status "New, added <date>" (green for a week). Status says In the blast (or "Still visiting (smoothing due), in the blast" for a Smoothing-list client whose last visit is inside 6 months, from `still_smoothing` in `lost_sheet_rows`, 13 Oct 2026), Taken out: <reason>, No number on file (cannot be messaged), No valid number (cannot be messaged) (14 Oct 2026: every number Phorest has for her was refused by respond.io as malformed, HTTP 400, so the dashboard already has her as `nonum` and To message leaves her out; only the sheet Status was missing it, from `wa = 'nonum'` in `lost_sheet_rows`), Booked <date>, Recent visit, Opted out based on respond.io (not messaged) (she replied stop / not interested, or is blocked; also shown for a client who has dropped off the lists for that reason, from `lost_sheet_optouts`, 13 Oct 2026), or Off the list now. A client with no phone number is never in the blast (To message and the files leave her out too); she stays on the sheet so the team can look for a number in Phorest. Column K Phone holds the number(s) Phorest has. `refresh` (which does rewrite) is for when nobody is editing. Usual stylist / beautician shows both names in one cell ("Ruth Bocock · Beauty: Mona Soba"), hair or beauty from the dashboard's staff-profiles.js (read from origin/main).

**Last service** (13 Oct 2026): shows the latest service on any date (`last_service_any`, migrations/lost_last_service_any.sql in the dashboard repo), and "Retail only, <date>" for a client whose visits since 1 Jan 2025 were all retail. Usual stylist / beautician stays blank for her (retail is unassigned in Phorest).

**Clients with 2+ numbers** (13 Oct 2026): a client is a name, so two people with one name are one row with several numbers. `lost_phone_pick()` (dashboard repo, migrations/lost_multi_numbers.sql) counts her numbers that are active on WhatsApp (in respond.io, wrote to us in the last 548 days, not blocked, not opted out). Exactly one: To message sends to that number alone and column K says "will message this one". None or several: she leaves To message (Left out says N check numbers) and Status says "Check numbers (not messaged)" until someone decides which number is hers.

**Which number?** (13 Oct 2026, column L): for a client with 2+ numbers, a dropdown of her numbers (amber while Status says Check numbers and it is empty). Reception's pick goes to `lost_phone_choice` on the next sync (`lost_sheet_phone_apply`, migrations/lost_phone_choice.sql in the dashboard repo) and wins over the automatic rule: To message sends to that number alone, and if it is not active on WhatsApp she shows as a text. Clearing the cell goes back to the automatic rule; a number that is blocked or opted out in respond.io is ignored. `update` keeps the dropdowns on new rows; `py lost_review_sheets.py numbers` sets them up and rewrites the How to tab.

A client key that appears twice on a sheet (a copied row) counts once: a row with a reason beats a blank one, and of two rows with a reason the lower one wins; the log says so.

## Day to day

| Command | What it does |
|---|---|
| `py lost_review_sheets.py sync` | Reads each Take out? column and applies the changes to the dashboard. `--dry` shows the counts only. The scheduled task runs this. |
| `py lost_review_sheets.py refresh` | Syncs first, then rewrites the rows from the database (new bookings, new clients). Choices already made are kept. |
| `py lost_review_sheets.py rows` | Counts what each sheet would hold, no Google needed. |

Sync rule: a reason that was not there at the last sync is written to the dashboard; a cell that held a reason at the last sync and is now blank puts her back; a deleted row changes nothing; more than 300 changes in one sync stops unless `--force`. `state.json` holds the last-synced reasons.

Rows on 12 Oct 2026: SAA 2,691, KCA 2,438, MC 964, AQ 1,038 (every client in groups 1 to 5 whose last branch it is, booked ones greyed with their next appointment).

`sheets.json`, `state.json` and `token.json` are gitignored: sheet links and the Google token stay on this PC.

**After our message, column N** (18 Oct 2026, Kate: "add another column to show if they replied, STOP, rebooked with a deposit or not yet"): what came of the WhatsApp we sent her, from `lost_sheet_outcomes(pass)` (migrations/lost_sheet_outcomes.sql, applied live 18 Oct), written by `outcome_column()` on every `update` and by `numbers`. States, first true wins: Waiting to be sent, Opted out (STOP / DND), Blocked us, Rebooked deposit paid, Rebooked for today no deposit needed, Rebooked deposit not paid yet, Replied, then by respond.io's delivery status of OUR message: Seen only (read, no reply), Delivered only, Sent not delivered yet, Failed to deliver (WhatsApp refused it, e.g. its marketing frequency cap or undeliverable), Sent no reply yet (status not read yet); each sent one ends with ` · sent 16 Oct`. The delivery status comes from `lost_wa_status.out_msgs` (migrations/lost_wa_out_status.sql, applied live 18 Oct): `respond-status-sync` (deployed v5, 18 Oct) keeps the newest 8 outgoing messages per number as [{t seconds, s read/delivered/failed/sent}] on its nightly run, and the outcome picks the one nearest our send time (within 15 minutes). respond.io gives each message a `status` list of {value, timestamp} steps (pending, sent, delivered, read, failed); a dry run on 18 Oct confirmed it. Statuses move on the nightly sync (22:00 UTC), so a message sent today shows its delivery tomorrow morning. A deposit is Phorest's `Deposit` item net of `Deposit (Refund)` in `sales_transaction_lines` over 90 days, matched on the client key. Green = deposit paid, yellow = rebooked without one, pink = opted out or blocked. First fill on 18 Oct: SAA 2,010 clients, KCA 1,898, MC 686, AQ 593.

**Column layout** (13 Oct 2026): A Client, B Last visit, C Last service, D Last smoothing (date of her last keratin or Supreme Straighten, blank for others; `last_smoothing` from `lost_sheet_rows`), E Usual stylist / beautician, F Next appointment, G Take out?, H Note, I key (hidden), J Status, K Phone, L Which number?, M Area. Status says "Still visiting (smoothing due), in the blast" for a Smoothing-list client whose last visit is inside 6 months (`still_smoothing`). Last smoothing took Area's place beside Last service and Area moved to M, so G to L never moved (`relayout` did the one-off move, row by row, and checked every row). `update` writes B:F and M; the sync still reads G:I and I:L.
