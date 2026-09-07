/**
 * backfill-weekly-ledgers.gs — STANDALONE script (script.google.com/create), same pattern as
 * sync-all-branches.gs. Do NOT paste into a branch spreadsheet.
 *
 * WHAT IT DOES
 * Reads the raw weekly ledger workbooks (the "WEEK n (…)" / "WK n (…)" files with MONDAY…SUNDAY
 * tabs) straight from Drive, works out each stylist's day from the per-staff summary block on
 * every day tab, and pushes the rows to Supabase `branch_staff_daily` — the same table and the
 * same shape sync-all-branches.gs writes. No monthly mirror sheets, no Build/Rebuild Dates,
 * no _temp_placeholder. Point it at a year's folders, run once, done.
 *
 * Works on Google Sheets AND .xlsx files (xlsx is converted to a temporary Sheet on the fly and
 * trashed afterwards). Walks every subfolder under each ROOTS entry, so month folders with any
 * naming ("1 JANUARY 2025", "10 October", "January 2025", "1. JANUARY") are all fine.
 *
 * SETUP (once)
 *  1. New standalone Apps Script project → paste this whole file.
 *  2. Nothing to add under Services. .xlsx files are converted through the Drive REST API
 *     with the script's own token; Google Sheets open directly.
 *  3. Check YEAR and ROOTS below.
 *  4. Run backfillStart() once. Authorise Drive + Sheets + external requests when asked.
 *     It queues every weekly file into one log spreadsheet ("LEDGER BACKFILL — log" in My Drive),
 *     on a tab named after the year, so 2025, 2024 and 2023 sit side by side in the same file,
 *     processes files for ~4 minutes, then re-triggers itself every minute until the queue is empty
 *     (Apps Script kills a run at 6 minutes, so it works in slices). Leave it alone; no need to babysit.
 *  5. Watch the QUEUE tab of the log sheet: one row per file with status, dates pushed, row count, notes.
 *     Link is printed in the execution log of backfillStart().
 *  6. When every row says OK / SKIPPED, run backfillReport(): it lists any (branch, date) that TWO
 *     different files pushed (a stale copy, a mislabelled week). Check those by hand.
 *  7. Run resolveDuplicates(): where two files claimed one date, the file whose own name covers
 *     that date wins and is pushed again. Dates only one file claimed are never touched.
 *     resolveCopiedWeeks() then moves whole files saved under another week's dates, and
 *     rescueStrayTabs() settles single day tabs whose A1 belongs to another week.
 *  8. Then run reconcile(): checks the year against Phorest, whose dates come from the till, and
 *     writes a "RECONCILE <year>" tab listing only the days worth looking at.
 *  Steps 6 to 8 run themselves once the queue drains, one step per trigger slice so no step
 *  shares its six minutes with another, then autoTriageSafe() repairs the mechanical findings
 *  (template columns, spellings, archived markers, closed days).
 *
 * TO RE-RUN FOR ANOTHER SCOPE (e.g. one branch, one month, another year)
 *  Change YEAR to a year listed in ROOTS_BY_YEAR, then run backfillStart() again. It clears that
 *  year's queue tab only. For a narrower scope, pass a smaller ROOTS by editing that year's entry.
 *  Pushing the same dates twice is harmless: every (branch, date) is deleted then re-inserted.
 *
 * WHAT IT DELIBERATELY SKIPS (all logged as SKIPPED / WARN, never silently)
 *  - Files whose name starts with "Copy of" WHEN the original sits beside them in the same
 *    branch. A copy with no original is the only record of its week and is read normally.
 *  - Day tabs whose A1 date is outside YEAR (e.g. the Dec days inside a "Dec 30 - Jan 5" week).
 *    A blank or 1899/1900 A1 is NOT this: that date is filled in from the rest of the week.
 *  - Day tabs whose A1 lands outside the week the rest of the file covers are left for
 *    rescueStrayTabs(), which runs after the queue drains (see there). One inside that week on the
 *    wrong weekday is a slipped date formula, and is corrected to the day its tab name asks for.
 *  - Placeholder staff blocks (AA, BB, CC, DD, XX…) when the whole block is zero.
 *  - Blocks whose name is a spreadsheet error (#REF!).
 */

// ── EDIT: the only line that changes between years ─────────────────────────────────────────
const YEAR = 2025;

// Every year's folders, recorded once. A year is added here, never by editing YEAR's meaning:
// one copy of this script runs them all, so a fix made here is a fix for every year. The log
// file keeps a separate tab per year, so running one never touches another's results.
// Verified against Drive on 3 Sep 2026. The folder holding the weekly files is named
// differently every year (WEEKLY LEDGERS, Weekly Ledgers, Week End, WEEKEND), so each entry is
// the branch folder whose subtree is walked, not a guess at the name.
const ROOTS_BY_YEAR = {
  // 2026 is the live year, so its days are already in branch_staff_daily: the daily sync pushed
  // them from the branch mirror sheet. Where that sheet was empty the sync still pushed the whole
  // roster, every figure zero, which is what the Upload Portal calls "arrived blank" - the rows
  // are there, the numbers never were. KCA's 2 - 4 January are exactly that, and the weekly file
  // holding the real figures (WEEK 1 (JAN.2-4).xlsx: KATE 7 requests, AED5,055; TEGAN 4, AED6,015)
  // had never been read, because no 2026 entry existed here.
  //
  // Deliberately ONE month folder, not the branch folder: pushRows_ deletes a (branch, date) and
  // re-inserts it, so a run replaces every day it touches. Wide open on 2026 would swap the daily
  // sync's full-roster rows for the day tabs' own five or six name blocks across the whole year,
  // on days that are already right. January proves the parse on a partial week first; widen after
  // (the branch folders are KCA 1UuZwha1A9gPPq4-CKLiv-biZnp9NhvOw, SAA 1_XeEvBD7TWWbpUIh-Ud7KZWsvtjhehCm,
  // MC 1tlKxg4UyWFD2e3dLV2lCDEYYaT28O7kf, AQ 1OAo7uYiYVyEpf3IxpVg5zVIUdWE4BvCn, all under
  // "TARA ROSE LADIES SALON 2026" 16SP8AeirlTNT68W4KuPPtOFW8avPzzIL). Kate, 4 Sep 2026.
  2026: {
    // KHALIFA CITY 2026 / WEEKLY LEDGERS / 01 JANUARY 2026                          (.xlsx)
    KCA: '1eOW9ojLNsEBmcNgS37N2ItTsjQ5i_rSZ',
  },
  2025: {
    SAA: '1PAHi6DCHX5MFZeOAU0dbVxPFzV2Ib1ly', // SAADIYAT / WEEKLY LEDGERS
    KCA: '1t7SCQxkd8q0-otw-L2m9xVgkO6qHqR-6', // KHALIFA / WEEKLY LEDGERS          (.xlsx)
    MC:  '1CbFpjAeMCuncah6cN4nXxixE4Ktwu66X', // MOTOR CITY 2025 / WEEK END-2025
    AQ:  '1qZz8vidhNDkGSXyP1JLfBSZzJnZolRLX', // AL QUOZ / TARA ROSE / WEEKEND     (.xlsx)
    // Fratelli has a full 2025 ledger and this script had never looked at it: twelve month
    // folders of WK n xlsx named exactly like the other branches, against 0 rows in
    // branch_staff_daily and 365 Phorest days. Its 2026 folder, for when that year is added,
    // is 1hbAqBE1lBDmTt0dJUYJaqA57XNMaHFva (Kate, 4 Sep 2026).
    FRT: '1FOQ07ynWAXp1uqW8ME_S3gJ8T9afm6Sf', // FRATELLI / WEEKEND LEDGERS        (.xlsx)
  },
  2024: {
    SAA: '1cqDYbmzH9s5cRJb2XwS1SuHppWf7BNoW', // SAADIYAT / 2024- WEEKLY LEDGER
    KCA: '1PgFPdqNj4MvhH3_UGHLNUXbJNUkO9jeZ', // KHALIFA / Weekly Ledgers          (.xlsx)
    MC:  '1_TwQQEGftcv1swY9aDU6IjlaM36XTwlz', // MOTOR CITY / Week End- 2024
    AQ:  '1-yH6OuW8oy0xwC9cYae9ye2Aja6klP_F', // AL QUOZ / TRS / WEEK END
  },
  // 2023, 2022, 2021, 2020 live under "LEDGERS YEARS" (1H85v53VWgpeNvmDdL45Ldfe3kdQSX6_g):
  // 2023 1ZhjnCrThWUy5Tvx2SJNANhChk8mqpLwh, 2022 1M7Gosj_bjMN_Qm9_A1ek0JkeSld3xwC0,
  // 2021 1bPWn3GerJfgairpV8Oh4MZDeBqCLcpil, 2020 1hWAFE1j3yctdIuxoazbLZ-lgvMEidA36.
  // List each year's LEDGERS subfolder and add the four branch folders here before running it.
};

const ROOTS = ROOTS_BY_YEAR[YEAR];
// ──────────────────────────────────────────────────────────────────────────────────────────

// The log spreadsheet. Set so a fresh project — a new year's copy of this script — writes into
// the same file, on its own year tab, instead of making a second log. Blank to let it find or
// create its own.
const LOG_FILE_ID = '1nmf5udEm_kurfJrhpSxQKKbXog2HvuldZnre5QYc-DA';

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';

const DAY_TABS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const SKIP_FILE = /^\s*copy of/i;
const PLACEHOLDERS = ['AA', 'BB', 'CC', 'DD', 'EE', 'XX', 'AAA', 'BBB', 'CCC', 'AAA0'];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TIME_BUDGET_MS = 4 * 60 * 1000; // stop picking up new files after this; a trigger continues
const MAX_ROWS_READ = 160;             // day tabs put everything that matters above row ~140

// Same list as sync-all-branches.gs, plus the ASSISTANTS misspelling seen in 2026 data.
const NAME_FIXES = {
  // Capitalised, like every value below: the title-case forms this list carried from
  // sync-all-branches.gs put 77 days of "Lizanie" beside 246 of LIZANIE in 2025 (Kate, 7 Sep 2026).
  'LIZANNIE': 'LIZANIE',
  'SHELLY': 'SHELLEY',
  // Capitalised, not title case. The ledger writes first names in caps, the roster is keyed in
  // caps, and autoTriage's own caseVariants step folds any odd spelling ONTO the capitalised one,
  // so a title-case value here was fighting the rule two hundred lines below it: KCA's 2026 rows
  // all say HAZEL MAE and this was about to add a second "Hazel Mae" beside them (Kate, 4 Sep 2026).
  'HAZEL MAY': 'HAZEL MAE',
  // KCA's Beauty block heads her column KIMBERLY some weeks and KIM others, and Phorest carries
  // "Kimberly Casas". KIM is the name on her staff card, so KIM it stays, the one place the
  // ledger's short name beats the till's: nameLinks_ still finds "KIMBERLY CASAS" from KIM, so
  // reconcile and the dashboard join are unaffected (Kate, 7 Sep 2026, after a brief detour
  // through KIMBERLY the same afternoon).
  'KIMBERLY': 'KIM',
  'ASISSTANTS': 'ASSISTANTS',
  // Both spellings sit in AQ's own 2025 tabs for one person; Phorest has XYRHY UNISA.
  'XYHRY': 'XYRHY',
  // One person each, confirmed by Kate on 3 Sep 2026. The ledger's spelling is moved onto
  // Phorest's, because the dashboard attaches Phorest revenue to the ledger by name and Phorest
  // is the till's own record. ROZA and ROJA sit together on 212 days of 2025, MJ and MARY JOY
  // GALOS on 194.
  'ROZA': 'ROJA',
  'MJ': 'MARY JOY',
  // Phorest's spelling wins whenever the ledger and the till disagree, settled by Kate on
  // 7 Sep 2026 ("gayahin natin kung ano nasa Phorest"). MMI is a typo for MIMI (one day, KCA);
  // Phorest has MA. ERCELY VACAL, the MC tabs write her three ways; MARCELLA SAVICIC, one L
  // on two MC days; ASSISTANT once at KCA beside ASSISTANTS everywhere else.
  'MMI': 'MIMI',
  // Fratelli's tabs write the walk-in bucket three ways, BUSINESS, business and BUSSINESS, and on
  // 121 days two of them sit side by side in one tab, so they are added up in pushRows_ like
  // ASSISTANTS rather than left as two rows of one bucket (Kate, 7 Sep 2026).
  'BUSINESS': 'BUSINESS',
  'BUSSINESS': 'BUSINESS',
  'ERCELY': 'MA. ERCELY',
  'MA ERCELY': 'MA. ERCELY',
  'MARCELA': 'MARCELLA',
  'ASSISTANT': 'ASSISTANTS',
};

// One log file for every year; each year gets its own tab, named after the year, and its own
// REPORT tab. Running 2024 therefore leaves the 2025 tab alone (Kate, 3 Sep 2026).
const LOG_TITLE = 'LEDGER BACKFILL — log';
const QUEUE_TAB = String(YEAR);
const REPORT_TAB = `REPORT ${YEAR}`;
// The last three are the triage's: what it repaired for this file's dates, and when. Part of
// the header so a fresh backfillStart lays them out rather than wiping them (Kate, 4 Sep 2026).
const QUEUE_HEADER = ['file_id', 'name', 'path', 'branch', 'mime', 'status', 'dates', 'rows', 'note',
                      'finished_at', 'fixed?', 'fix notes', 'fix finished at'];
const PROP = PropertiesService.getScriptProperties();
// Set once a run has spent its automatic retry; cleared by backfillStart.
const RETRY_FLAG = 'RETRIED_' + YEAR;
// How far the after-run chain has got, one step per trigger slice; cleared by backfillStart.
const STAGE_KEY = 'CHAIN_STAGE_' + YEAR;
// The steps that follow the queue, in order. Each is safe to repeat. resolveDuplicates only ever
// re-pushes a file that already pushed once; resolveCopiedWeeks and rescueStrayTabs write only
// onto days the table holds nothing for. autoTriageSafe runs last and repairs the mechanical
// findings (template columns saved as staff, one person under two spellings, archived markers,
// closed days) on its own; the cross-table name pairings it is less sure of stay on the TRIAGE
// tab for a person, and autoTriageApply() acts on those (Kate, 7 Sep 2026).
const CHAIN = [
  ['backfillReport', backfillReport], ['resolveDuplicates', resolveDuplicates],
  ['resolveCopiedWeeks', resolveCopiedWeeks], ['rescueStrayTabs', rescueStrayTabs],
  ['reconcile', reconcile], ['autoTriageSafe', autoTriageSafe],
];

// ══════════════════════════════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ══════════════════════════════════════════════════════════════════════════════════════════

/** Step 1. Builds the queue of weekly files under ROOTS, then starts processing. */
function backfillStart() {
  if (!ROOTS) {
    throw new Error(
      `No folders recorded for ${YEAR}. Add a ${YEAR} entry to ROOTS_BY_YEAR (branch code → the ` +
      `branch folder under LEDGERS YEARS / ${YEAR} / LEDGERS) and run this again. ` +
      `Years ready now: ${Object.keys(ROOTS_BY_YEAR).join(', ')}.`);
  }
  PROP.deleteProperty(RETRY_FLAG);   // this run gets its own automatic retry
  PROP.deleteProperty(STAGE_KEY);    // and its after-run chain starts from the first step
  deleteContinueTriggers_();
  const ss = getLog_(true);
  const queue = [];
  Object.keys(ROOTS).forEach(branch => {
    const root = DriveApp.getFolderById(ROOTS[branch]);
    walk_(root, root.getName(), branch, queue);
  });
  const q = ss.getSheetByName(QUEUE_TAB);
  if (queue.length) {
    q.getRange(2, 1, queue.length, QUEUE_HEADER.length)
    // Padded to the header's own width rather than a typed row of blanks, so widening
    // QUEUE_HEADER can never again leave setValues writing 10 columns into 13 (Kate, 4 Sep 2026).
     .setValues(queue.map(function (e) {
       const row = [e.id, e.name, e.path, e.branch, e.mime];
       while (row.length < QUEUE_HEADER.length) row.push('');
       return row;
     }));
  }
  Logger.log(`Queued ${queue.length} weekly files for ${YEAR}. Log sheet: ${ss.getUrl()}`);
  backfillContinue();
}

/** Step 2 (automatic). Processes pending queue rows until the time budget runs out, then re-arms itself. */
function backfillContinue() {
  const lock = LockService.getScriptLock();
  // A slice already running is the normal case, not a reason to stop: a trigger fires every
  // minute and backfillStart calls this directly, so the two meet often. Returning without
  // re-arming was what killed the 9:49 run on 4 Sep 2026 - 226 files queued, the lock busy for
  // those five seconds, and nothing ever picked them up. Hand the work back to a trigger
  // instead, so the queue always drains on its own (Kate, 4 Sep 2026).
  if (!lock.tryLock(5000)) {
    scheduleContinue_();
    Logger.log('Another slice is still running; this one steps aside and retries in a minute.');
    return;
  }
  try {
    const started = Date.now();
    const ss = getLog_(false);
    const q = ss.getSheetByName(QUEUE_TAB);
    const last = q.getLastRow();
    if (last < 2) { Logger.log('Queue is empty. Run backfillStart() first.'); return; }
    const data = q.getRange(2, 1, last - 1, QUEUE_HEADER.length).getValues();
    let pending = 0, doneThisRun = 0;
    const failedRows = [];   // filled as the loop goes; the snapshot above predates every status

    for (let i = 0; i < data.length; i++) {
      if (data[i][5]) continue; // status already set
      pending++;
      if (Date.now() - started > TIME_BUDGET_MS) continue; // out of time; leave for next slice

      const entry = { id: data[i][0], name: data[i][1], path: data[i][2], branch: data[i][3], mime: data[i][4],
                      copyHasOriginal: copyHasOriginal_(data, i) };
      let result;
      try {
        result = processFile_(entry);
      } catch (e) {
        result = { status: 'FAILED', dates: [], rows: 0, note: String(e && e.message || e) };
      }
      q.getRange(i + 2, 6, 1, 5).setValues([[
        result.status, result.dates.join(' '), result.rows, result.note || '', new Date(),
      ]]);
      SpreadsheetApp.flush();
      if (result.status === 'FAILED') failedRows.push(i + 2);
      pending--; doneThisRun++;
    }

    if (pending > 0) {
      scheduleContinue_();
      Logger.log(`Slice done: ${doneThisRun} files this run, ${pending} still pending. Next slice in ~1 minute.`);
    } else if (retryFailedOnce_(q, failedRows)) {
      // A file that failed on a Drive hiccup usually reads fine on a second attempt, so the run
      // gives every FAILED row exactly one more go before it calls itself finished. Once per
      // backfillStart, tracked in a script property, so a file that is genuinely broken cannot
      // put the run in a loop (Kate, 4 Sep 2026).
      scheduleContinue_();
      Logger.log('Queue drained with failures. Retrying those once; next slice in ~1 minute.');
    } else {
      // The queue is drained, so the CHAIN runs: ONE step per trigger slice, never all of them
      // inside one execution. They used to run back to back right here, and on 7 Sep 2026 that
      // took the last slice to 415 seconds: Apps Script killed it at six minutes with
      // resolveDuplicates done, resolveCopiedWeeks half way, and rescueStrayTabs, reconcile and
      // autoTriageSafe never reached. The stage lives in a script property and is advanced
      // BEFORE the step runs, so a step that dies on the limit is skipped and logged rather than
      // retried for ever; the next slice is armed before the step too, so the hand-over does not
      // depend on this execution surviving (Kate, 7 Sep 2026).
      const stage = Number(PROP.getProperty(STAGE_KEY) || 0);
      if (stage >= CHAIN.length) {
        deleteContinueTriggers_();
        PROP.deleteProperty(STAGE_KEY);
        Logger.log('ALL DONE. Every step of the chain has run. Log: ' + ss.getUrl());
        return;
      }
      const step = CHAIN[stage];
      PROP.setProperty(STAGE_KEY, String(stage + 1));
      scheduleContinue_();
      let outcome;
      try { step[1](); outcome = 'ok'; }
      catch (e) { outcome = 'FAILED: ' + String(e && e.message || e); }
      Logger.log('Chain step ' + (stage + 1) + ' of ' + CHAIN.length + ', ' + step[0] + ': ' + outcome +
                 (stage + 1 < CHAIN.length ? '. Next step in ~1 minute.' : '. Last step; the next slice closes the run.') +
                 ' Log: ' + ss.getUrl());
    }
  } finally {
    lock.releaseLock();
  }
}

/** Step 3. Lists every (branch, date) that more than one file pushed, into a REPORT tab. */
function backfillReport() {
  const ss = getLog_(false);
  const q = ss.getSheetByName(QUEUE_TAB);
  const last = q.getLastRow();
  const seen = {}; // branch|date → [file names]
  const stats = { OK: 0, SKIPPED: 0, FAILED: 0, EMPTY: 0, rows: 0 };
  if (last >= 2) {
    q.getRange(2, 1, last - 1, QUEUE_HEADER.length).getValues().forEach(r => {
      const [id, name, path, branch, mime, status, dates, rows] = r;
      if (status in stats) stats[status]++;
      stats.rows += Number(rows) || 0;
      String(dates || '').split(' ').filter(Boolean).forEach(d => {
        const k = `${branch}|${d}`;
        (seen[k] = seen[k] || []).push(`${path} / ${name}`);
      });
    });
  }
  const dupes = Object.keys(seen).filter(k => seen[k].length > 1).sort();
  let rep = ss.getSheetByName(REPORT_TAB) || ss.insertSheet(REPORT_TAB);
  rep.clearContents();
  rep.getRange(1, 1, 1, 3).setValues([['branch', 'date', 'pushed by (last one wins)']]);
  if (dupes.length) {
    rep.getRange(2, 1, dupes.length, 3).setValues(dupes.map(k => {
      const [b, d] = k.split('|');
      return [b, d, seen[k].join('  |  ')];
    }));
  }
  const summary = `Files: OK ${stats.OK}, SKIPPED ${stats.SKIPPED}, FAILED ${stats.FAILED}, EMPTY ${stats.EMPTY}. ` +
                  `Rows pushed: ${stats.rows}. Dates pushed by more than one file: ${dupes.length}.`;
  rep.getRange(dupes.length + 3, 1).setValue(summary);
  Logger.log(summary + `\nReport tab: ${ss.getUrl()}`);
}

/** Clears FAILED rows back to pending and resumes. Use after enabling the Drive API service. */
function backfillRetryFailed() {
  const q = getLog_(false).getSheetByName(QUEUE_TAB);
  const last = q.getLastRow();
  if (last < 2) return;
  const status = q.getRange(2, 6, last - 1, 1).getValues();
  let n = 0;
  status.forEach((r, i) => {
    if (r[0] === 'FAILED') { q.getRange(i + 2, 6, 1, 5).clearContent(); n++; }
  });
  Logger.log(`Reset ${n} FAILED rows. Resuming.`);
  backfillContinue();
}

/**
 * Step 4. Checks the year against Phorest, the one source whose dates come from the till rather
 * than from a cell somebody typed. Writes a "RECONCILE <year>" tab: a summary line per branch and
 * month, then a line per problem day. Changes nothing in Supabase, it only reports. Run it after
 * a backfill and read the exceptions instead of opening ledger files.
 *
 * The two never match figure for figure and are not meant to: the ledger counts what the branch
 * tallied by hand, Phorest counts what went through the till. What is worth acting on is shape.
 * A day Phorest has and the ledger does not. A stylist Phorest shows working who is missing from
 * that day's tab. A ledger day Phorest says never happened, which is the signature of a week
 * copied from another week.
 */
function reconcile() {
  const led = supaAll_('branch_staff_daily', 'branch,date,staff_name,total');
  const pho = supaAll_('phorest_staff_daily', 'branch,date,employee_name,visits,is_total');

  const L = {}, P = {};
  led.forEach(function (r) {
    const k = r.branch + '|' + r.date;
    (L[k] = L[k] || []).push({ name: normUpper_(r.staff_name), total: Number(r.total) || 0 });
  });
  pho.forEach(function (r) {
    if (r.is_total || !(Number(r.visits) > 0)) return;
    const k = r.branch + '|' + r.date;
    (P[k] = P[k] || []).push({ name: normUpper_(r.employee_name), visits: Number(r.visits) });
  });

  const months = {}, detail = [];
  function bump(branch, month, field) {
    const k = branch + '|' + month;
    months[k] = months[k] || { branch: branch, month: month, phorest: 0, ledger: 0, both: 0, missing: 0, noPhorest: 0, staffGap: 0 };
    months[k][field]++;
  }

  const keys = {};
  Object.keys(L).forEach(function (k) { keys[k] = true; });
  Object.keys(P).forEach(function (k) { keys[k] = true; });

  Object.keys(keys).sort().forEach(function (k) {
    const parts = k.split('|'), branch = parts[0], date = parts[1], month = date.slice(0, 7);
    const l = L[k] || [], p = P[k] || [];
    if (p.length) bump(branch, month, 'phorest');
    if (l.length) bump(branch, month, 'ledger');

    if (p.length && !l.length) {
      bump(branch, month, 'missing');
      const visits = p.reduce(function (n, x) { return n + x.visits; }, 0);
      detail.push([branch, date, 'no ledger for a day Phorest has', p.length + ' stylists, ' + visits + ' visits in Phorest']);
    } else if (l.length && !p.length) {
      const busy = l.filter(function (x) { return x.total > 0; });
      if (busy.length) {
        bump(branch, month, 'noPhorest');
        detail.push([branch, date, 'ledger figures on a day Phorest says was quiet', busy.length + ' stylists with figures, a copied week?']);
      }
    } else if (l.length && p.length) {
      bump(branch, month, 'both');
      const absent = p.filter(function (x) {
        return !l.some(function (y) { return nameLinks_(x.name, y.name); });
      });
      if (absent.length) {
        bump(branch, month, 'staffGap');
        detail.push([branch, date, 'stylists working in Phorest but absent from the tab',
                     absent.map(function (x) { return x.name; }).join(', ')]);
      }
    }
  });

  const ss = getLog_(false);
  const tabName = 'RECONCILE ' + YEAR;
  const sh = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  sh.clearContents();
  const head = ['branch', 'month', 'Phorest days', 'ledger days', 'both', 'ledger missing',
                'no Phorest activity', 'days with a stylist gap'];
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  const rows = Object.keys(months).sort().map(function (k) {
    const m = months[k];
    return [m.branch, m.month, m.phorest, m.ledger, m.both, m.missing, m.noPhorest, m.staffGap];
  });
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);

  const start = rows.length + 3;
  sh.getRange(start, 1, 1, 4).setValues([['branch', 'date', 'what', 'detail']]).setFontWeight('bold');
  const cut = detail.slice(0, 2000);
  if (cut.length) sh.getRange(start + 1, 1, cut.length, 4).setValues(cut);
  sh.setFrozenRows(1);

  Logger.log('Reconciled ' + YEAR + ': ' + rows.length + ' branch-months, ' + detail.length +
             ' days worth looking at' + (detail.length > cut.length ? ' (first ' + cut.length + ' listed)' : '') +
             '. Tab: ' + tabName);
}

// Phorest carries the full name, the ledger the name the branch writes at the top of the block.
// One links to the other when the ledger name opens any word of the Phorest name, so JEIDA finds
// "JEIDA RACHMANOVA" and AREANNE finds "PRINCESS AREANNE MIRANDA". A nickname sharing no spelling
// (AQ's MJ for MARY JOY GALOS) or a misspelling (ROZA for ROJA PUDTADO) cannot be caught this way
// and belongs in NAME_FIXES once the right spelling is settled.
function nameLinks_(phorestName, ledgerName) {
  if (!ledgerName) return false;
  if (phorestName.indexOf(ledgerName) === 0) return true;
  return phorestName.split(' ').some(function (w) { return w.indexOf(ledgerName) === 0; });
}

function normUpper_(s) { return str_(s).toUpperCase().replace(/\s+/g, ' '); }

// Reads a whole table for YEAR a page at a time; PostgREST caps a response at 1000 rows.
function supaAll_(table, select) {
  const headers = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const url = SUPA_URL + '/rest/v1/' + table + '?select=' + select +
                '&date=gte.' + YEAR + '-01-01&date=lte.' + YEAR + '-12-31' +
                '&order=date&limit=1000&offset=' + offset;
    const resp = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
    if (resp.getResponseCode() >= 300) {
      throw new Error(table + ' read failed (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
    }
    const page = JSON.parse(resp.getContentText());
    page.forEach(function (r) { out.push(r); });
    if (page.length < 1000) return out;
  }
}

/**
 * Step 3b. Settles the dates that more than one file pushed.
 *
 * Not a filter on the way in: a day tab is never dropped for disagreeing with its file name,
 * because a file often carries a day its name does not mention and that day is usually real
 * (SAA's "WEEK 1 (2ND - 5TH)" holds 1 January, and MC's "WK 1 (Dec 30-Jan 5)" holds the whole
 * first week of the year). It is only a tie-breaker. When two files both claim one date, the
 * one whose own name covers that date wins, and its rows are pushed again so they land last.
 * A date only one file ever claimed is never touched.
 *
 * Run it after backfillStart has finished and after backfillReport. Anything it cannot decide
 * is listed in the REPORT tab for a person to settle.
 */
function resolveDuplicates() {
  const ss = getLog_(false);
  const q = ss.getSheetByName(QUEUE_TAB);
  const last = q.getLastRow();
  if (last < 2) { Logger.log('Nothing queued for ' + YEAR + '.'); return; }
  const data = q.getRange(2, 1, last - 1, QUEUE_HEADER.length).getValues();

  const byDate = {};   // branch|date → [row index into data]
  data.forEach(function (r, i) {
    if (r[5] !== 'OK') return;
    String(r[6] || '').split(' ').filter(String).forEach(function (d) {
      const k = r[3] + '|' + d;
      (byDate[k] = byDate[k] || []).push(i);
    });
  });

  const winners = {}, undecided = [];
  Object.keys(byDate).forEach(function (k) {
    const idxs = byDate[k];
    if (idxs.length < 2) return;
    const date = k.split('|')[1];
    const covers = idxs.filter(function (i) {
      const wk = weekFromName_(data[i][1], data[i][2]);
      return wk && date >= wk.from && date <= wk.to;
    });
    if (covers.length === 1) {
      winners[covers[0]] = true;
    } else {
      undecided.push([k.split('|')[0], date, idxs.map(function (i) { return data[i][2] + ' / ' + data[i][1]; }).join('  |  '),
                      covers.length ? 'both names cover it' : 'no name covers it']);
    }
  });

  const done = [];
  Object.keys(winners).forEach(function (i) {
    const r = data[i];
    const entry = { id: r[0], name: r[1], path: r[2], branch: r[3], mime: r[4] };
    try {
      const res = processFile_(entry);
      done.push([r[3], r[1], res.status, res.dates.join(' '), res.rows]);
      q.getRange(Number(i) + 2, 6, 1, 5).setValues([[res.status, res.dates.join(' '), res.rows,
        (res.note ? res.note + ' | ' : '') + 'pushed again to settle a date two files claimed', new Date()]]);
      SpreadsheetApp.flush();
    } catch (e) {
      done.push([r[3], r[1], 'FAILED', '', String(e && e.message || e)]);
    }
  });

  const rep = ss.getSheetByName(REPORT_TAB) || ss.insertSheet(REPORT_TAB);
  let row = rep.getLastRow() + 2;
  rep.getRange(row, 1).setValue('Duplicate dates settled by file name, ' + new Date()).setFontWeight('bold');
  row++;
  rep.getRange(row, 1, 1, 5).setValues([['branch', 'file pushed again', 'status', 'dates', 'rows']]).setFontWeight('bold');
  if (done.length) { rep.getRange(row + 1, 1, done.length, 5).setValues(done); row += done.length; }
  row += 2;
  rep.getRange(row, 1).setValue('Still needs a person').setFontWeight('bold');
  row++;
  rep.getRange(row, 1, 1, 4).setValues([['branch', 'date', 'claimed by', 'why']]).setFontWeight('bold');
  if (undecided.length) rep.getRange(row + 1, 1, undecided.length, 4).setValues(undecided);

  Logger.log('Settled ' + done.length + ' file(s) by name; ' + undecided.length +
             ' date(s) still need a person. REPORT tab: ' + REPORT_TAB);
}

/**
 * Step 3c. A whole week saved under another week's dates.
 *
 * resolveDuplicates settles who owns a date two files both claimed. It cannot give back the week
 * the losing file was actually about. AQ's "WK 4 (Aug 25-31).xlsx" holds 11 to 17 August in its
 * A1s: whoever made it copied the file before it and never changed the dates. The parser believes
 * the dates, as it should, so that week landed on 11-17 August on top of the real WK 2, and 25-31
 * August was left with nothing at all. Three of AQ's missing weeks of 2025 are this, and so are
 * some of KCA's and MC's.
 *
 * A file is only moved when all four of these hold, so nothing moves on a hunch:
 *   1. every date it pushed lies OUTSIDE the week its own file name claims;
 *   2. the week its name claims is completely empty in branch_staff_daily;
 *   3. every date it pushed is also claimed by another file whose name DOES cover that date,
 *      so moving this one takes nothing away from anybody;
 *   4. its figures differ from the ones now stored on those dates. Identical figures mean the
 *      file is an unfilled copy of the week before it rather than a mislabelled week, and
 *      writing it onto the empty week would be inventing a week of trade. Those are reported.
 *
 * The move is a whole number of weeks, so every tab keeps its own weekday and every check in
 * processFile_ still means what it meant. Run it after resolveDuplicates; backfillContinue
 * already does. What it moved, and what it decided not to, go to the REPORT tab.
 */
function resolveCopiedWeeks() {
  const ss = getLog_(false);
  const q = ss.getSheetByName(QUEUE_TAB);
  const last = q.getLastRow();
  if (last < 2) { Logger.log('Nothing queued for ' + YEAR + '.'); return; }
  const data = q.getRange(2, 1, last - 1, QUEUE_HEADER.length).getValues();

  // who pushed what, and what is in the table now
  const byDate = {};
  data.forEach(function (r, i) {
    if (r[5] !== 'OK') return;
    String(r[6] || '').split(' ').filter(String).forEach(function (d) {
      (byDate[r[3] + '|' + d] = byDate[r[3] + '|' + d] || []).push(i);
    });
  });
  const stored = {};   // branch|date|dept|staff → that row's figures
  const hasDay = {};   // branch|date → true
  supaAll_('branch_staff_daily',
           'branch,date,dept,staff_name,ncr,req,salon,new_client,rebooked,total,treatment_aed,retail_unit_qty,treatments_unit_qty')
    .forEach(function (r) {
      hasDay[r.branch + '|' + r.date] = true;
      stored[r.branch + '|' + r.date + '|' + r.dept + '|' + r.staff_name] = figures_(r);
    });

  const moved = [], held = [];
  data.forEach(function (r, i) {
    if (r[5] !== 'OK') return;
    const branch = r[3];
    const wk = weekFromName_(r[1], r[2]);
    if (!wk) return;
    const pushed = String(r[6] || '').split(' ').filter(String).sort();
    if (!pushed.length) return;

    // 1. nothing it pushed is inside the week its name claims
    if (pushed.some(function (d) { return d >= wk.from && d <= wk.to; })) return;

    const fileMonday = mondayOf_(pushed[0]);
    const nameMonday = mondayOf_(wk.from);
    const shift = isoDiff_(nameMonday, fileMonday);
    if (!shift || shift % 7 !== 0) return;   // not a clean week apart; leave that to a person

    // 2. the week its name claims is empty
    const emptyDays = [];
    for (let n = 0; n < 7; n++) {
      const d = isoAdd_(nameMonday, n);
      if (d >= wk.from && d <= wk.to && !hasDay[branch + '|' + d]) emptyDays.push(d);
    }
    if (emptyDays.length < 7) {
      if (emptyDays.length) {
        held.push([branch, r[2] + ' / ' + r[1], wk.from + ' → ' + wk.to,
                   'only ' + emptyDays.length + ' of that week is empty, so a person should look']);
      }
      return;
    }

    // 3. everything it pushed is already held by a file whose name covers it
    const safeToMove = pushed.every(function (d) {
      return (byDate[branch + '|' + d] || []).some(function (j) {
        if (j === i) return false;
        const w2 = weekFromName_(data[j][1], data[j][2]);
        return w2 && d >= w2.from && d <= w2.to;
      });
    });
    if (!safeToMove) {
      held.push([branch, r[2] + ' / ' + r[1], pushed[0] + ' → ' + pushed[pushed.length - 1],
                 'no other file claims the dates it pushed, so moving it would empty them']);
      return;
    }

    // 4. read it again without writing, and compare with what is stored on those dates
    let read;
    try {
      read = processFile_({ id: r[0], name: r[1], path: r[2], branch: branch, mime: r[4] }, { dryRun: true });
    } catch (e) {
      held.push([branch, r[2] + ' / ' + r[1], '', 'could not be re-read: ' + String(e && e.message || e)]);
      return;
    }
    if (!read.parsed.length) {
      held.push([branch, r[2] + ' / ' + r[1], wk.from + ' → ' + wk.to, 'reads as empty now, nothing to move']);
      return;
    }
    let same = 0, differs = 0;
    read.parsed.forEach(function (row) {
      const was = stored[branch + '|' + row.date + '|' + row.dept + '|' + row.staff_name];
      if (was === undefined || was !== figures_(row)) differs++; else same++;
    });
    if (!differs) {
      held.push([branch, r[2] + ' / ' + r[1], wk.from + ' → ' + wk.to,
                 'all ' + same + ' of its rows match the week already stored: an unfilled copy, not a mislabelled week']);
      return;
    }

    let res;
    try {
      res = processFile_({ id: r[0], name: r[1], path: r[2], branch: branch, mime: r[4] }, { shiftDays: shift });
    } catch (e) {
      held.push([branch, r[2] + ' / ' + r[1], '', 'move failed: ' + String(e && e.message || e)]);
      return;
    }
    moved.push([branch, r[2] + ' / ' + r[1], pushed[0] + ' → ' + pushed[pushed.length - 1],
                res.dates.join(' '), res.rows]);
    res.dates.forEach(function (d) { hasDay[branch + '|' + d] = true; });
    q.getRange(i + 2, 6, 1, 5).setValues([[res.status, res.dates.join(' '), res.rows,
      (res.note ? res.note + ' | ' : '') + 'moved ' + (shift / 7) + ' week(s) onto the dates its own file name claims',
      new Date()]]);
    SpreadsheetApp.flush();
  });

  const rep = ss.getSheetByName(REPORT_TAB) || ss.insertSheet(REPORT_TAB);
  let row = rep.getLastRow() + 2;
  rep.getRange(row, 1).setValue('Weeks saved under another week\'s dates, ' + new Date()).setFontWeight('bold');
  row++;
  rep.getRange(row, 1, 1, 5).setValues([['branch', 'file', 'was on', 'moved to', 'rows']]).setFontWeight('bold');
  if (moved.length) { rep.getRange(row + 1, 1, moved.length, 5).setValues(moved); row += moved.length; }
  row += 2;
  rep.getRange(row, 1).setValue('Looked like one and was left alone').setFontWeight('bold');
  row++;
  rep.getRange(row, 1, 1, 4).setValues([['branch', 'file', 'week', 'why']]).setFontWeight('bold');
  if (held.length) rep.getRange(row + 1, 1, held.length, 4).setValues(held);

  Logger.log('Moved ' + moved.length + ' week(s) onto the dates their file names claim; ' +
             held.length + ' left alone. REPORT tab: ' + REPORT_TAB);
}

/**
 * Step 3d. Single day tabs whose A1 belongs to another week.
 *
 * processFile_ leaves such a tab alone on the first pass and writes "STRAY <tab>: ..." into the
 * file's note (see the long comment there for the two shapes and the rules). Once the queue has
 * drained this re-reads every file carrying a STRAY note with opts.rescue, which handles those
 * tabs and nothing else, so a date another file won in resolveDuplicates is never pushed again.
 * A tab is only ever written onto a day the table holds nothing for. What was rescued and what
 * was held, and why, go to the REPORT tab; the file's own queue row gains the rescued dates.
 *
 * Whole files whose every tab is a copy of another week never get here: their tabs agree with
 * each other, so weekMonday_ takes their week and resolveCopiedWeeks moves the file. Files whose
 * every A1 is impossible (MC's WK 5 (Oct 27 - Nov 2), WK 4 (Nov 24 - Nov 30), AQ's WK 4 (Oct
 * 20- Oct 26)) do: weekMonday_ finds nothing to count from, the name gives the week, and every
 * tab is a stray of the typed-mistake kind (Kate, 7 Sep 2026).
 */
function rescueStrayTabs() {
  const ss = getLog_(false);
  const q = ss.getSheetByName(QUEUE_TAB);
  const last = q.getLastRow();
  if (last < 2) { Logger.log('Nothing queued for ' + YEAR + '.'); return; }
  const data = q.getRange(2, 1, last - 1, QUEUE_HEADER.length).getValues();

  const rescued = [], held = [];
  data.forEach(function (r, i) {
    if (r[5] !== 'OK' && r[5] !== 'EMPTY') return;
    if (String(r[8] || '').indexOf('STRAY ') === -1) return;
    const label = r[2] + ' / ' + r[1];
    // A file resolveCopiedWeeks has already moved carries its move in the note. Its strays belong
    // to the moved week too: FRT's WK 4 (Sept 22 - 28) has Monday to Wednesday dated 15 to 17
    // September and was moved a week on, but its Thursday to Sunday, dated by hand to the 22nd
    // to the 24th, were about to be tried on 18 to 21 September, the week it was moved away
    // from (Kate, 7 Sep 2026).
    const moved = String(r[8] || '').match(/moved (\d+) week\(s\)/);
    const shift = moved ? Number(moved[1]) * 7 : 0;
    let res;
    try {
      res = processFile_({ id: r[0], name: r[1], path: r[2], branch: r[3], mime: r[4] }, { rescue: true, rescueShift: shift });
    } catch (e) {
      held.push([r[3], label, '', '', 'could not be re-read: ' + String(e && e.message || e)]);
      return;
    }
    (res.held || []).forEach(function (h) { held.push([r[3], label, h.tab, h.a1 + ' -> ' + h.date, h.why]); });
    if (!res.rescued || !res.rescued.length) return;
    res.rescued.forEach(function (x) { rescued.push([r[3], label, x.tab, x.a1, x.date, x.rows]); });
    const dates = {};
    String(r[6] || '').split(' ').filter(String).forEach(function (d) { dates[d] = true; });
    res.rescued.forEach(function (x) { dates[x.date] = true; });
    const note = (r[8] ? r[8] + ' | ' : '') + 'rescued ' +
      res.rescued.map(function (x) { return x.tab + ' onto ' + x.date; }).join(', ');
    q.getRange(i + 2, 6, 1, 5).setValues([['OK', Object.keys(dates).sort().join(' '),
      (Number(r[7]) || 0) + res.rows, note, new Date()]]);
    SpreadsheetApp.flush();
  });

  const rep = ss.getSheetByName(REPORT_TAB) || ss.insertSheet(REPORT_TAB);
  let row = rep.getLastRow() + 2;
  rep.getRange(row, 1).setValue('Day tabs dated from their own name, ' + new Date()).setFontWeight('bold');
  row++;
  rep.getRange(row, 1, 1, 6).setValues([['branch', 'file', 'tab', 'A1 said', 'pushed on', 'rows']]).setFontWeight('bold');
  if (rescued.length) { rep.getRange(row + 1, 1, rescued.length, 6).setValues(rescued); row += rescued.length; }
  row += 2;
  rep.getRange(row, 1).setValue('Stray tabs left alone').setFontWeight('bold');
  row++;
  rep.getRange(row, 1, 1, 5).setValues([['branch', 'file', 'tab', 'A1 -> would be', 'why']]).setFontWeight('bold');
  if (held.length) rep.getRange(row + 1, 1, held.length, 5).setValues(held);

  Logger.log('Rescued ' + rescued.length + ' stray tab(s); ' + held.length + ' left alone. REPORT tab: ' + REPORT_TAB);
}

// What branch_staff_daily holds for one branch-day: dept|staff -> figures_ string. Empty when nothing.
function storedDay_(branch, date) {
  const url = SUPA_URL + '/rest/v1/branch_staff_daily?select=dept,staff_name,ncr,req,salon,new_client,rebooked,total,' +
              'treatment_aed,retail_unit_qty,treatments_unit_qty&branch=eq.' + encodeURIComponent(branch) + '&date=eq.' + date;
  const resp = UrlFetchApp.fetch(url, { headers: supaHeaders_(), muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) {
    throw new Error('read of ' + branch + ' ' + date + ' failed (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
  }
  const out = {};
  JSON.parse(resp.getContentText()).forEach(function (r) { out[r.dept + '|' + r.staff_name] = figures_(r); });
  return out;
}

// True when a "Copy of X" sits beside an "X" in the same branch's queue. Only then is the copy a
// duplicate worth skipping; a copy with no original is the only record of its week and is read
// like any other file. All 17 of 2025's copies have their original beside them (Kate, 7 Sep 2026).
function copyHasOriginal_(data, i) {
  const name = String(data[i][1]);
  if (!SKIP_FILE.test(name)) return false;
  const squash = function (n) { return String(n).replace(/\s+/g, ' ').trim().toUpperCase(); };
  const base = squash(name.replace(SKIP_FILE, ''));
  return data.some(function (r, j) {
    return j !== i && r[3] === data[i][3] && !SKIP_FILE.test(String(r[1])) && squash(r[1]) === base;
  });
}

// One staff row's figures as a single string, so two readings of the same day compare in one go.
function figures_(r) {
  return [r.ncr, r.req, r.salon, r.new_client, r.rebooked, r.total,
          Number(r.treatment_aed).toFixed(2), r.retail_unit_qty, r.treatments_unit_qty].join('|');
}

function mondayOf_(iso) { return isoAdd_(iso, -isoDayIndex_(iso)); }

function isoDiff_(a, b) { return Math.round((isoParts_(a) - isoParts_(b)) / 86400000); }

// The week a file's own name claims, as {from, to} in yyyy-MM-dd, or null when the name does not
// say. Reads the last bracketed part of the name ("WK 2 (Apr 7 - 13)", "WEEK 5 ( JULY 28-AUG 3)",
// "WEEK 2 (APR 7TH - 13TH)", "WK 1 (02 - 05)") and takes the month from the folder when the name
// gives only numbers. Tested against all 226 of the 2025 file names: 149 of the 150 that carry
// data were read, the one exception being a file literally named "WEEK 1()".
function weekFromName_(name, path) {
  const base = String(name).replace(/\.(xlsx|xls)$/i, '');
  const brackets = base.match(/\(([^)]*)\)/g);
  if (!brackets || !brackets.length) return null;
  const inside = brackets[brackets.length - 1].replace(/[()]/g, '');
  if (!inside.trim()) return null;

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthIn = function (text) {
    const up = String(text).toUpperCase();
    let best = -1, num = null;
    MONTHS.forEach(function (m, i) {
      const at = up.indexOf(m);
      if (at >= 0 && (best < 0 || at < best)) { best = at; num = i + 1; }
    });
    return num;
  };

  // walk the bracket left to right, keeping the month in force when the first day appears
  const toks = inside.match(/[A-Za-z]+|\d+/g) || [];
  let month = null, day = null;
  for (let i = 0; i < toks.length && day === null; i++) {
    const t = toks[i];
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (n >= 1 && n <= 31) day = n;
    } else {
      const m = MONTHS.indexOf(t.toUpperCase().slice(0, 3));
      if (m >= 0) month = m + 1;
    }
  }
  if (day === null) return null;

  const folder = String(path).split('/').pop();
  const folderMonth = monthIn(folder) || monthIn(path);
  if (month === null) month = folderMonth;
  if (month === null) return null;

  // "WK 1 (Dec 30-Jan 5)" filed under January belongs to the December before it
  let year = YEAR;
  if (month === 12 && folderMonth === 1) year = YEAR - 1;

  const from = new Date(year, month - 1, day);
  if (isNaN(from)) return null;
  // Every file is a Monday-to-Sunday week and the brackets are typed by hand, so a name is off
  // by a day now and then: KCA's "WEEK 2 (JULY 6-12)" is the week of 7 to 13 July, its
  // "WEEK 1 (JUNE 30-JULY 5)" runs to the 6th. The week is the one whose Monday is nearest the
  // first day the name gives, so `from` is always a Monday from here on (Kate, 7 Sep 2026).
  const idx = (from.getDay() + 6) % 7;
  from.setDate(from.getDate() - (idx <= 3 ? idx : idx - 7));
  const to = new Date(from.getTime());
  to.setDate(to.getDate() + 6);
  const tz = Session.getScriptTimeZone();
  return { from: fmt_(from, tz), to: fmt_(to, tz) };
}

/**
 * A HANDFUL OF DAYS, RIGHT NOW. The small tool next to backfillStart's big one.
 *
 * backfillStart is built for a year: it queues a whole folder, processes it in four-minute slices
 * behind a self-re-arming trigger, then chains backfillReport, resolveDuplicates, reconcile and
 * autoTriage across every branch of YEAR. Correct for a year, far too slow for three days.
 *
 * This reads the files listed below and pushes them. Nothing else: no queue tab, no log sheet,
 * no trigger, no chain. Same parser and same push as the big run, so what it writes is exactly
 * what the big run would have written, and running the big one later changes nothing.
 *
 * A file's own day tabs decide the dates, so listing WEEK 1 (JAN.2-4) touches 1 to 4 January and
 * no other day. Check YEAR matches the files' year, edit FILES, run it, read the execution log.
 * (Kate, 4 Sep 2026: the three days KCA arrived blank did not need a month queued.)
 */
function backfillFiles() {
  const FILES = [
    // branch, file id                                  file
    ['KCA', '1ZEGmTwEIjuGKRPXkvHW0mP1cd8UYEnYZ'],    // WEEK 1 (JAN.2-4).xlsx  → 1-4 Jan 2026
  ];

  const log = [];
  FILES.forEach(function (pair) {
    const branch = pair[0], id = pair[1];
    let f;
    try { f = DriveApp.getFileById(id); }
    catch (e) { log.push(branch + '  ' + id + '\n  CANNOT OPEN: ' + String(e && e.message || e)); return; }
    const parents = f.getParents();
    const entry = { id: id, name: f.getName(), branch: branch, mime: f.getMimeType(),
                    path: parents.hasNext() ? parents.next().getName() : '' };
    let res;
    try { res = processFile_(entry); }
    catch (e) { log.push(branch + '  ' + entry.name + '\n  FAILED: ' + String(e && e.message || e)); return; }
    log.push(branch + '  ' + entry.name + '  [' + entry.path + ']' +
             '\n  ' + res.status + ', ' + res.rows + ' rows on ' + (res.dates.join(' ') || 'no dates') +
             (res.note ? '\n  notes: ' + res.note : ''));
  });
  Logger.log('YEAR ' + YEAR + ', ' + FILES.length + ' file(s):\n\n' + log.join('\n\n'));
}

/** Emergency stop: removes the self-re-arming trigger. Pending rows stay pending. */
function backfillStop() {
  deleteContinueTriggers_();
  Logger.log('Stopped. Run backfillContinue() to resume where it left off.');
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ONE FILE
// ══════════════════════════════════════════════════════════════════════════════════════════

function processFile_(entry, opts) {
  opts = opts || {};
  if (SKIP_FILE.test(entry.name) && entry.copyHasOriginal) {
    return { status: 'SKIPPED', dates: [], rows: 0, note: '"Copy of" duplicate; the original sits beside it and was read instead' };
  }

  let tempId = null;
  try {
    let ssId = entry.id;
    if (entry.mime === XLSX_MIME) {
      tempId = convertXlsx_(entry.id, entry.name);
      ssId = tempId;
    }
    const ss = SpreadsheetApp.openById(ssId);
    const tz = ss.getSpreadsheetTimeZone();
    const notes = [];
    const allRows = [];
    const dates = [];

    // Read every day tab first, then date them. A tab whose A1 was never filled in still
    // belongs to a known week: the tabs that ARE dated give the Monday, and the tab's own name
    // gives the offset from it. 77 day tabs across 2025 were lost to a blank or 1899/1900 A1
    // before this (Kate, 3 Sep 2026).
    //
    // Every date below is a plain 'yyyy-MM-dd' STRING from here on, never a Date. A cell's date
    // is read once, through the spreadsheet's own timezone, which is the date a person sees in
    // it; after that all the arithmetic is calendar arithmetic on the string. The old code did
    // the arithmetic on Date objects and then formatted them back through that timezone, and the
    // Apps Script project's timezone is not the spreadsheets' - so a date built at midnight here
    // formatted as the DAY BEFORE there. Directly-dated tabs were fine, because their date came
    // from the original instant; every derived or corrected one landed a day early, failed the
    // weekday check and was thrown away as a stale copy. 90 day tabs of 2025 went that way,
    // including 35 Sundays, which is Motor City's missing Sundays (Kate, 4 Sep 2026).
    const days = [];
    ss.getSheets().forEach(sheet => {
      const tab = sheet.getName().trim().toUpperCase();
      if (DAY_TABS.indexOf(tab) === -1) return;
      const lastRow = Math.min(sheet.getLastRow(), MAX_ROWS_READ);
      const lastCol = sheet.getLastColumn();
      if (lastRow < 5 || lastCol < 4) return;
      const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      days.push({ tab: tab, values: values, iso: cellIso_(values[0][0], tz) });
    });

    // The week from the day tabs when any of them is dated, and from the file's own name when
    // none is. Without the second, a workbook whose A1s were all left blank lost its whole week
    // rather than a day: nothing to count from. weekFromName_ reads the bracket in the file name
    // and the month from its folder, and the date is snapped back to that week's Monday. Every
    // tab still has to land on the weekday its own name claims, so a name that turns out to
    // describe a different week is skipped loudly instead of saved wrongly (Kate, 4 Sep 2026).
    const wk = weekFromName_(entry.name, entry.path);   // its `from` is a Monday
    let monday = weekMonday_(days, notes, wk ? wk.from : null);
    if (!monday && wk) {
      monday = wk.from;
      notes.push('week taken from the file name, Monday ' + monday);
    }
    const rescued = [], held = [];

    days.forEach(day => {
      const tab = day.tab;
      let dateStr = day.iso;
      // Blank, or one of the 1899-12-31 / 1900-01-01 serials an empty cell formats into. A real
      // date from the neighbouring year (a Dec 30 - Jan 5 week) is NOT this, and is left alone.
      const unfilled = !dateStr || Number(dateStr.slice(0, 4)) < 1990;
      let derived = false;
      if (unfilled) {
        if (!monday) { notes.push(`${tab}: no date in A1 and the week could not be worked out, skipped`); return; }
        dateStr = isoAdd_(monday, DAY_TABS.indexOf(tab));
        derived = true;
      }
      let weekday = isoWeekday_(dateStr);
      // A1 on the wrong weekday splits two ways, and the file's own week tells them apart.
      // Inside this file's week: the A1s are "the day before, plus one" formulas and one of them
      // slipped, so the week is not in doubt, only the offset. Take the date the tab name asks
      // for. Outside it: the tab is a stray, settled below.
      if (weekday !== tab && monday && isoWithinWeek_(dateStr, monday)) {
        const was = dateStr;
        dateStr = isoAdd_(monday, DAY_TABS.indexOf(tab));
        weekday = isoWeekday_(dateStr);
        notes.push(`${tab}: A1 said ${was}, a ${weekday === tab ? 'shifted' : 'wrong'} day inside this week, corrected to ${dateStr}`);
      }

      // A stray: an A1 outside the week the rest of the file covers. Two shapes, told apart by
      // the weekday. A1 on the WRONG weekday for its tab is a typed mistake (MC's WK 5 (Oct 27 -
      // Nov 2) has Monday as 25/10/2025, SAA's WEEK 1 (JUNE 2- JUNE 8) has Thursday as 05/04/2025)
      // and the tab is the day its name and its file say it is. A1 on the RIGHT weekday in another
      // week is a tab copied from that week, and only its figures can say whether anyone filled it
      // in. Both need the rest of the year in the table to be judged, so the first pass writes a
      // STRAY note and leaves the tab; rescueStrayTabs() re-reads the file with opts.rescue once
      // the queue has drained and handles nothing but these (Kate, 7 Sep 2026).
      const stray = monday ? !isoWithinWeek_(dateStr, monday) : weekday !== tab;
      if (opts.rescue && !stray) return;
      if (stray) {
        if (!monday) { notes.push(`WARN ${tab}: A1 says ${dateStr} which is a ${weekday} — stale copy? skipped`); return; }
        const target = isoAdd_(monday, DAY_TABS.indexOf(tab) + (opts.rescueShift || 0));
        if (!opts.rescue) {
          notes.push(`STRAY ${tab}: A1 says ${dateStr}, a ${weekday} outside this file's week; tried on ${target} after the run`);
          return;
        }
        const hold = function (why) { held.push({ tab: tab, a1: dateStr, date: target, why: why }); };
        if (Number(target.slice(0, 4)) !== YEAR) { hold(`${target} is outside ${YEAR}`); return; }
        const rows = parseDay_(day.values, target, tab, notes);
        if (!rows.length) { hold('no staff rows'); return; }
        const there = storedDay_(entry.branch, target);
        const nThere = Object.keys(there).length;
        if (nThere) { hold(`${target} already holds ${nThere} rows from another file`); return; }
        if (weekday === tab) {
          const was = storedDay_(entry.branch, dateStr);
          if (!Object.keys(was).length) { hold(`nothing stored on ${dateStr} to compare with`); return; }
          const differs = rows.some(function (row) { return was[row.dept + '|' + row.staff_name] !== figures_(row); });
          if (!differs) { hold(`same figures as ${dateStr}, an unfilled copy`); return; }
        }
        rescued.push({ tab: tab, a1: dateStr, date: target, rows: rows.length });
        dates.push(target);
        allRows.push(...rows.map(r => Object.assign({ branch: entry.branch }, r)));
        return;
      }
      if (Number(dateStr.slice(0, 4)) !== YEAR) { notes.push(`${tab}: ${dateStr} outside ${YEAR}, skipped`); return; }

      // A whole week saved under another week's dates, settled by resolveCopiedWeeks and handed
      // back here as a shift. Always a multiple of seven days, so every tab keeps its own
      // weekday and the checks above still mean what they meant.
      if (opts.shiftDays) {
        const was = dateStr;
        dateStr = isoAdd_(dateStr, opts.shiftDays);
        if (Number(dateStr.slice(0, 4)) !== YEAR) {
          notes.push(`${tab}: ${was} shifts to ${dateStr}, outside ${YEAR}, skipped`);
          return;
        }
        notes.push(`${tab}: ${was} → ${dateStr}, the week this file's own name claims`);
      }

      if (derived) notes.push(`${tab}: A1 was blank, dated ${dateStr} from the rest of the week`);
      const rows = parseDay_(day.values, dateStr, tab, notes);
      if (!rows.length) { notes.push(`${tab} ${dateStr}: no staff rows`); return; }
      dates.push(dateStr);
      allRows.push(...rows.map(r => Object.assign({ branch: entry.branch }, r)));
    });

    if (opts.rescue) {
      const pushed = allRows.length ? pushRows_(entry.branch, allRows) : 0;
      return { status: 'RESCUE', dates: dates.sort(), rows: pushed, note: notes.join(' | '),
               parsed: allRows, rescued: rescued, held: held };
    }
    if (!allRows.length) return { status: 'EMPTY', dates: [], rows: 0, note: notes.join(' | '), parsed: [] };
    if (opts.dryRun) {
      return { status: 'READ', dates: dates.sort(), rows: allRows.length, note: notes.join(' | '), parsed: allRows };
    }
    const pushed = pushRows_(entry.branch, allRows);
    return { status: 'OK', dates: dates.sort(), rows: pushed, note: notes.join(' | '), parsed: allRows };
  } finally {
    if (tempId) { try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) { /* ignore */ } }
  }
}

// Converts an .xlsx Drive file to a temporary Google Sheet (in a temp folder in My Drive).
// Goes to the Drive REST API with the script's own token rather than the "Drive" advanced
// service, so there is nothing to add under Services and a reverted appsscript.json cannot
// take it away again (Kate, 3 Sep 2026: that cost two runs of KCA). The scopes it needs are
// already granted by the DriveApp and UrlFetchApp calls elsewhere in this file.
function convertXlsx_(fileId, name) {
  const resp = UrlFetchApp.fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      payload: JSON.stringify({
        name: `__TEMP__ ${name}`,
        mimeType: MimeType.GOOGLE_SHEETS,
        parents: [tempFolderId_()],
      }),
      muteHttpExceptions: true,
    }
  );
  if (resp.getResponseCode() >= 300) {
    throw new Error(`xlsx conversion failed (${resp.getResponseCode()}): ${resp.getContentText().slice(0, 300)}`);
  }
  return JSON.parse(resp.getContentText()).id;
}

function tempFolderId_() {
  let id = PROP.getProperty('TEMP_FOLDER_ID');
  if (id) { try { DriveApp.getFolderById(id); return id; } catch (e) { /* recreate */ } }
  id = DriveApp.createFolder('__LEDGER BACKFILL TEMP__ (safe to delete)').getId();
  PROP.setProperty('TEMP_FOLDER_ID', id);
  return id;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ONE DAY TAB → rows
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// Day-tab anatomy (same template 2025 and 2026, every branch):
//   row 1  A1 = the date            row 2 = day name
//   Section 1 (Hair):  names row, then "Client | Type | Service | Amount" header, client entries,
//                      then per-block summary starting at a "Type | Count | Service | Total" row:
//                      Request / Salon / New / New Client Req counts in col+1, "Rebooked" count in col+3,
//                      "Total Retail" row → treatment total (incl. VAT) in col+3,
//                      "Total Retail QTY" → col+1, "Treatment QTY" → col+3, ends at "GRAND TOTAL (CHECKING)".
//   Section 2 (Beauty): same shape, lower down; "Total Retail QTY" value sits in col+2; no treatments.
// Each staff block is 4 columns wide. Blocks anchor on their OWN "Type|Count" row because some tabs have
// the right-hand blocks' summary pushed down a couple of rows (seen in Friday tabs).
// Mirrors the WEEKEND roll-up formulas: NCR=New Client Req, REQ=Request, SALON=Salon, NEW=New,
// REBOOKED=Rebooked, TOTAL = NCR+REQ+SALON+NEW (Hair) / REQ+SALON+NEW (Beauty),
// TREATMENT AED = treatment total / 1.05 (Hair only).

// ── DATES AS STRINGS ────────────────────────────────────────────────────────────────────
// One conversion at the boundary, then calendar arithmetic on 'yyyy-MM-dd'. Nothing below
// touches a timezone, so the gap between the script project's and the spreadsheets' can no
// longer move a date (Kate, 4 Sep 2026 - see the long note in processFile_).

// The date a person sees in the cell. The only place a timezone is consulted.
function cellIso_(v, tz) {
  const d = readDate_(v, tz);
  return d ? fmt_(d, tz) : null;
}

function isoParts_(iso) {
  const p = String(iso).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function isoOf_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function isoAdd_(iso, n) {
  const d = isoParts_(iso);
  d.setDate(d.getDate() + n);
  return isoOf_(d);
}

// 0 for Monday, matching DAY_TABS, so an offset is always index arithmetic.
function isoDayIndex_(iso) { return (isoParts_(iso).getDay() + 6) % 7; }

function isoWeekday_(iso) { return DAY_TABS[isoDayIndex_(iso)]; }

// True when a date falls inside the Monday-to-Sunday week that starts at mondayIso.
function isoWithinWeek_(iso, mondayIso) {
  const n = Math.round((isoParts_(iso) - isoParts_(mondayIso)) / 86400000);
  return n >= 0 && n <= 6;
}

// The Monday of the week a file covers, as 'yyyy-MM-dd', from whichever day tabs carry a date
// that is real, inside YEAR, and lands on the weekday its own tab name claims. Every such tab
// implies the same Monday. If they disagree the file is a mix of weeks and nothing is filled in.
function weekMonday_(days, notes, nameMonday) {
  const seen = {};
  days.forEach(function (day) {
    const iso = day.iso;
    if (!iso || Number(iso.slice(0, 4)) !== YEAR) return;
    if (isoWeekday_(iso) !== day.tab) return;
    const m = isoAdd_(iso, -DAY_TABS.indexOf(day.tab));
    seen[m] = (seen[m] || 0) + 1;
  });
  const keys = Object.keys(seen);
  if (keys.length > 1) {
    // Half the tabs re-dated for the new week, half still carrying the week the file was copied
    // from: KCA's WEEK 2 (JULY 6-12), WEEK 1 (SEPT 1-7) and WEEK 4 (OCT 20-26) all read this way.
    // The file's own name settles which week is meant when it matches one of them; the tabs on
    // the other week then go to rescueStrayTabs instead of overwriting the week they are copied
    // from, which is what pushed KCA's 8 to 10 August three times (Kate, 7 Sep 2026).
    if (nameMonday && seen[nameMonday]) {
      notes.push(`the day tabs point at ${keys.length} different weeks (${keys.join(', ')}); the file name settles it on ${nameMonday}`);
      return nameMonday;
    }
    notes.push(`WARN the day tabs point at ${keys.length} different weeks (${keys.join(', ')}); no dates filled in`);
    return null;
  }
  return keys.length ? keys[0] : null;
}

// True when a block carries the summary labels even though its own "Type | Count" cell is blank.
function blockHasLabels_(low, sr, c, secEnd) {
  for (let r = sr; r < Math.min(sr + 12, secEnd); r++) {
    const l = low(r, c);
    if (l === 'request' || l === 'salon' || l === 'new client req') return true;
  }
  return false;
}

function parseDay_(values, dateStr, tab, notes) {
  const nrows = values.length;
  const ncols = values[0].length;
  const cell = (r, c) => (r >= 0 && r < nrows && c >= 0 && c < ncols) ? values[r][c] : '';
  const low = (r, c) => str_(cell(r, c)).toLowerCase();

  // Section header rows: any block showing "Client | Type". Names sit one row above.
  const H = [];
  for (let r = 1; r < nrows; r++) {
    for (let c = 0; c < ncols; c += 4) {
      if (low(r, c) === 'client' && low(r, c + 1) === 'type') { H.push(r); break; }
    }
  }
  if (!H.length) { notes.push(`${tab} ${dateStr}: no "Client | Type" header rows`); return []; }

  const rows = [];
  const claimed = {};
  H.forEach((h, k) => {
    const dept = k === 0 ? 'Hair' : 'Beauty';
    const namesRow = h - 1;
    const secEnd = k + 1 < H.length ? H[k + 1] - 1 : nrows;

    // Where each block's summary starts. Blocks anchor on their own row because some tabs push
    // the right-hand blocks down a row or two.
    const srByCol = {};
    for (let c = 0; c < ncols; c += 4) {
      for (let r = h + 1; r < secEnd; r++) {
        if (low(r, c) === 'type' && low(r, c + 1) === 'count') { srByCol[c] = r; break; }
      }
    }
    // The row the rest of the section uses. A block whose own "Type | Count" cells were never
    // typed in still has its counts in the rows below, so it reads from here rather than being
    // dropped in silence (Kate, 3 Sep 2026: ROVINA was going missing on SAA tabs that way).
    const tally = {};
    Object.keys(srByCol).forEach(c => { tally[srByCol[c]] = (tally[srByCol[c]] || 0) + 1; });
    let commonSr = -1, best = 0;
    Object.keys(tally).forEach(r => { if (tally[r] > best) { best = tally[r]; commonSr = Number(r); } });

    for (let c = 0; c < ncols; c += 4) {
      const name = str_(cell(namesRow, c));
      // Blank column, a spreadsheet error, or one of the template's own words sitting where a
      // name should be. All three mean "not a staff block", and none of them is a judgement about
      // the figures: an idle stylist with a real name is still read and still pushed.
      if (!name || name.charAt(0) === '#' || isLabel_(name)) continue;

      let sr = (c in srByCol) ? srByCol[c] : -1;
      if (sr < 0 && commonSr >= 0 && blockHasLabels_(low, commonSr, c, secEnd)) {
        sr = commonSr;
        notes.push(`WARN ${tab} ${dateStr}: ${name} has no "Type | Count" cell, read from row ${sr + 1} like the rest of the section`);
      }
      if (sr < 0) continue;
      claimed[sr] = true;

      let end = secEnd;
      for (let r = sr; r < secEnd; r++) {
        if (str_(cell(r, c)).toUpperCase().indexOf('GRAND TOTAL') === 0) { end = r + 1; break; }
      }

      const m = { ncr: 0, req: 0, salon: 0, nw: 0, reb: 0, rq: 0, tq: 0, treatTotal: 0 };
      for (let r = sr; r < end; r++) {
        const l0 = low(r, c), l2 = low(r, c + 2);
        if (l0 === 'request')              m.req   = num_(cell(r, c + 1));
        else if (l0 === 'salon')           m.salon = num_(cell(r, c + 1));
        else if (l0 === 'new')             m.nw    = num_(cell(r, c + 1));
        else if (l0 === 'new client req')  m.ncr   = num_(cell(r, c + 1));
        else if (l0 === 'total retail qty') {
          const v1 = cell(r, c + 1);
          m.rq = (typeof v1 === 'number') ? v1 : num_(cell(r, c + 2));
        }
        else if (l0 === 'total retail' && dept === 'Hair') m.treatTotal = num_(cell(r, c + 3));
        if (l2 === 'rebooked')             m.reb = num_(cell(r, c + 3));
        else if (l2 === 'treatment qty')   m.tq  = num_(cell(r, c + 3));
      }

      const total = dept === 'Hair' ? m.ncr + m.req + m.salon + m.nw : m.req + m.salon + m.nw;
      const row = {
        date: dateStr,
        dept: dept,
        staff_name: normalizeStaffName_(name),
        ncr: Math.round(m.ncr),
        req: Math.round(m.req),
        salon: Math.round(m.salon),
        new_client: Math.round(m.nw),
        rebooked: Math.round(m.reb),
        total: Math.round(total),
        treatment_aed: dept === 'Hair' ? Math.round(m.treatTotal / 1.05 * 100) / 100 : 0,
        retail_unit_qty: Math.round(m.rq),
        treatments_unit_qty: dept === 'Hair' ? Math.round(m.tq) : 0,
      };
      const allZero = !(row.ncr || row.req || row.salon || row.new_client || row.rebooked ||
                        row.treatment_aed || row.retail_unit_qty || row.treatments_unit_qty);
      if (allZero && isPlaceholder_(name)) continue;
      rows.push(row);
    }
  });

  // A "Type|Count" row nobody claimed means a section lost its "Client" header row (hand-deleted).
  const orphans = [];
  for (let r = 0; r < nrows; r++) {
    if (!claimed[r] && low(r, 0) === 'type' && low(r, 1) === 'count') orphans.push(r + 1);
  }
  if (orphans.length) notes.push(`WARN ${tab} ${dateStr}: summary block at row ${orphans.join(',')} has no "Client" header above it — those staff were NOT read`);

  return rows;
}



// ══════════════════════════════════════════════════════════════════════════════════════════
// AUTOMATED TRIAGE — repairs the saved data, and reports on the row that caused it
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// reconcile() names what is wrong. This fixes what can be fixed without guessing, in
// branch_staff_daily itself, and writes the outcome into the three columns beside each file in
// the year's queue tab: fixed?, fix notes, fix finished at. Reading down one row therefore tells
// you what that weekly file pushed AND what had to be repaired afterwards, instead of holding a
// separate report next to it (Kate, 4 Sep 2026).
//
// A finding belongs to a branch and a date, not to a file, so it is attributed back through the
// dates column: the file that pushed 2025-08-17 for MC owns anything repaired on that day. Days
// no file pushed cannot be attributed that way, so a missing day is attributed instead to the
// file whose own NAME covers it, which is the folder to start hunting in. Whatever is left over
// belongs to no file at all and goes to the TRIAGE tab.
//
// DRY RUN unless you call autoTriageApply(). The dry run writes the same three columns with the
// note prefixed "would", so the plan appears exactly where the repair will.
//
// THE THREE IT FIXES
//  1. Template columns saved as staff. AA, BB, CC and the rest are the named-but-empty columns a
//     ledger template ships with, and they carry a stray retail or treatment figure often enough
//     that the parser's zero test kept them. They are not people, so the rows go. Safe because
//     the placeholder test is a repeated letter: MJ, IVY, MAY, KIM and EDS cannot match it.
//  2. A stylist under two spellings. Phorest carries the till's own name and the dashboard
//     attaches revenue by name, so the ledger's spelling moves onto Phorest's. Only when the
//     pairing is unambiguous: one unmatched ledger name and one unmatched Phorest name on the
//     same branch, sharing at least TRIAGE_MIN_DAYS days. Anything less is reported, not renamed.
//  3. A day nobody traded. Phorest has the day with nothing on it and the ledger has nothing
//     either, so it goes into closed_days and stops being a gap in every progress grid.
//
// THE TWO IT WILL NOT
//  4. A day the till has and the ledger does not. The figures were never captured; nothing in the
//     database can invent them.
//  5. Ledger figures on a day the till says was quiet. Those figures are real money sitting on
//     the wrong date, and the right date is elsewhere reading empty. Deleting them would lose a
//     day's takings and moving them would be a guess, so a person looks.
const TRIAGE_MIN_DAYS = 30;   // days two spellings must share before they are taken as one person

function autoTriage()      { runTriage_(false, false); }
function autoTriageApply() { runTriage_(true, false); }
// What the run does on its own: everything but the cross-table renames.
function autoTriageSafe()  { runTriage_(true, true); }

function runTriage_(apply, safeOnly) {
  const led = supaAll_('branch_staff_daily', 'branch,date,staff_name,dept,total');
  const pho = supaAll_('phorest_staff_daily', 'branch,date,employee_name,visits,is_total');

  const L = {}, P = {}, phoQuiet = {};
  led.forEach(function (r) {
    const k = r.branch + '|' + r.date;
    (L[k] = L[k] || []).push({ name: normUpper_(r.staff_name), raw: r.staff_name, total: Number(r.total) || 0 });
  });
  pho.forEach(function (r) {
    const k = r.branch + '|' + r.date;
    if (r.is_total) { if (!(k in phoQuiet)) phoQuiet[k] = true; return; }
    if (!(Number(r.visits) > 0)) return;
    phoQuiet[k] = false;
    (P[k] = P[k] || []).push({ name: normUpper_(r.employee_name) });
  });

  const plan = { placeholders: [], renames: [], caseVariants: [], archived: [], closures: [], missingDays: [],
                 copiedWeeks: [], unclear: [] };

  // ── 0. one person, two spellings ACROSS the two tables ──
  // Phorest hangs "(A)" on an archived staff member's name. The Staff Utilisation report's
  // parser strips it and keeps the fact in its own column; the Staff Performance one used to
  // leave it in the name. So the same person sat in phorest_staff_daily as "Rovina Jordan (A)"
  // and in staff_utilisation as "Rovina Jordan", and the dashboard joins them by name: 3,383
  // rows and 38 people were cut off from their own hours. The parser strips it now, and this
  // repairs what is already stored. Unambiguous - a marker comes off the end of a name and
  // nothing else changes - and checked for collisions first, because (branch, date,
  // employee_name) is unique (Kate, 4 Sep 2026).
  const pnames = supaAll_('phorest_staff_daily', 'branch,date,employee_name');
  const taken = {}, marked = {};
  pnames.forEach(function (r) {
    const raw = str_(r.employee_name);
    taken[r.branch + '|' + r.date + '|' + raw] = true;
    if (/\(A\)\s*$/.test(raw)) (marked[raw] = marked[raw] || []).push(r);
  });
  Object.keys(marked).sort().forEach(function (raw) {
    const to = raw.replace(/\s*\(A\)\s*$/, '').trim();
    const rows = marked[raw];
    const clash = rows.filter(function (r) { return taken[r.branch + '|' + r.date + '|' + to]; });
    if (clash.length) {
      plan.unclear.push({ branch: 'any', phorest: raw,
        ledger: 'cannot drop the (A): ' + to + ' already has a row on ' + clash.length +
                ' of the same days - two rows for one person' });
      return;
    }
    const dates = {};
    rows.forEach(function (r) { dates[r.branch + '|' + r.date] = true; });
    plan.archived.push({ from: raw, to: to, rows: rows.length, dates: dates });
  });

  // ── 1. template columns saved as staff, with the dates they sat on ──
  const ph = {};
  led.forEach(function (r) {
    if (!isPlaceholder_(r.staff_name)) return;
    const k = r.branch + '|' + normUpper_(r.staff_name);
    const e = ph[k] = ph[k] || { branch: r.branch, name: normUpper_(r.staff_name), rows: 0, dates: {} };
    e.rows++; e.dates[r.date] = true;
  });
  Object.keys(ph).sort().forEach(function (k) { plan.placeholders.push(ph[k]); });

  // ── 2. one person written two ways in the ledger alone ──
  // LIZANIE and Lizanie are the same person, and the dashboard attaches Phorest revenue by
  // name, so the second spelling reads as a phantom second stylist. Invisible to the check
  // below, because both spellings match Phorest perfectly well. The ledger writes first names
  // in caps and the roster is keyed in caps, so the capitalised form is the one to keep, and it
  // is the majority spelling in every group found so far. Skipped where both spellings sit on
  // one branch-day-dept, because (branch, date, dept, staff_name) is unique and the rename
  // would collide - that is two rows for one person on one day, which a person settles
  // (Kate, 4 Sep 2026).
  const spellings = {};
  led.forEach(function (r) {
    const raw = str_(r.staff_name), up = normUpper_(raw);
    if (!raw) return;
    const g = spellings[up] = spellings[up] || { variants: {}, cells: {}, dates: {} };
    g.variants[raw] = (g.variants[raw] || 0) + 1;
    const cell = r.branch + '|' + r.date + '|' + r.dept;
    (g.cells[cell] = g.cells[cell] || {})[raw] = true;
    if (raw !== up) g.dates[r.branch + '|' + r.date] = true;
  });
  Object.keys(spellings).sort().forEach(function (up) {
    const g = spellings[up];
    const others = Object.keys(g.variants).filter(function (v) { return v !== up; });
    if (!others.length) return;
    const clash = Object.keys(g.cells).some(function (c) { return Object.keys(g.cells[c]).length > 1; });
    const rows = others.reduce(function (n, v) { return n + g.variants[v]; }, 0);
    if (clash) {
      plan.unclear.push({ branch: 'any', phorest: 'n/a',
        ledger: up + ' is also written ' + others.join(', ') + ' and both sit on the same day, ' +
                rows + ' rows - two rows for one person' });
      return;
    }
    plan.caseVariants.push({ to: up, from: others, rows: rows, dates: g.dates });
  });

  // ── 2. a stylist under two spellings ──
  const unmatchedPho = {}, unmatchedLed = {};
  Object.keys(P).forEach(function (k) {
    const parts = k.split('|'), branch = parts[0], date = parts[1];
    const l = L[k] || [];
    P[k].forEach(function (p) {
      if (l.some(function (y) { return nameLinks_(p.name, y.name); })) return;
      const key = branch + '|' + p.name;
      const e = unmatchedPho[key] = unmatchedPho[key] || { branch: branch, name: p.name, days: 0 };
      e.days++;
    });
    l.forEach(function (y) {
      if (P[k].some(function (p) { return nameLinks_(p.name, y.name); })) return;
      const key = branch + '|' + y.name;
      const e = unmatchedLed[key] = unmatchedLed[key] || { branch: branch, name: y.name, raw: y.raw, days: 0, dates: {} };
      e.days++; e.dates[date] = true;
    });
  });
  const sides = {};
  Object.keys(unmatchedPho).forEach(function (k) {
    const u = unmatchedPho[k];
    (sides[u.branch] = sides[u.branch] || { pho: [], led: [] }).pho.push(u);
  });
  Object.keys(unmatchedLed).forEach(function (k) {
    const u = unmatchedLed[k];
    if (isPlaceholder_(u.name)) return;   // dealt with as a placeholder
    (sides[u.branch] = sides[u.branch] || { pho: [], led: [] }).led.push(u);
  });
  Object.keys(sides).sort().forEach(function (branch) {
    const s = sides[branch];
    const pho1 = s.pho.filter(function (x) { return x.days >= TRIAGE_MIN_DAYS; });
    const led1 = s.led.filter(function (x) { return x.days >= TRIAGE_MIN_DAYS; });
    if (pho1.length === 1 && led1.length === 1) {
      plan.renames.push({ branch: branch, from: led1[0].raw, fromKey: led1[0].name, to: pho1[0].name,
                          days: led1[0].days, dates: led1[0].dates });
    } else if (pho1.length || led1.length) {
      plan.unclear.push({ branch: branch,
        phorest: pho1.map(function (x) { return x.name + ' (' + x.days + 'd)'; }).join(', ') || 'none',
        ledger:  led1.map(function (x) { return x.name + ' (' + x.days + 'd)'; }).join(', ') || 'none' });
    }
  });

  // ── 3, 4, 5. one pass over every branch-day either side knows about ──
  const keys = {};
  [L, P, phoQuiet].forEach(function (m) { Object.keys(m).forEach(function (k) { keys[k] = true; }); });
  Object.keys(keys).sort().forEach(function (k) {
    const parts = k.split('|'), branch = parts[0], date = parts[1];
    const l = L[k] || [], p = P[k] || [];
    if (!l.length && !p.length && phoQuiet[k] === true) {
      plan.closures.push({ branch: branch, date: date });
    } else if (p.length && !l.length) {
      plan.missingDays.push({ branch: branch, date: date, stylists: p.length });
    } else if (l.length && !p.length) {
      const busy = l.filter(function (x) { return x.total > 0; });
      if (busy.length) plan.copiedWeeks.push({ branch: branch, date: date, stylists: busy.length });
    }
  });

  // The pairing rule (one unmatched name each side, 30 shared days) is a good guess, not a
  // certainty, so the unattended run lists these for a person instead of renaming.
  if (safeOnly && plan.renames.length) {
    plan.renames.forEach(function (r) {
      plan.unclear.push({ branch: r.branch, phorest: r.to + ' (' + r.days + 'd)',
        ledger: r.from + ' (' + r.days + 'd), one person by the look of it; autoTriageApply() renames it' });
    });
    plan.renames = [];
  }
  const acted = apply ? applyTriage_(plan) : null;
  const orphans = writeTriageOntoQueue_(plan, apply);
  writeTriageTab_(plan, acted, orphans);

  const n = function (a) { return a.length; };
  Logger.log((apply ? 'TRIAGE APPLIED' : 'TRIAGE DRY RUN') + ' ' + YEAR +
    ': placeholder names ' + n(plan.placeholders) + ', spellings ' + n(plan.caseVariants) +
    ', archived markers ' + n(plan.archived) +
    ', renames ' + n(plan.renames) +
    ', copied weeks ' + n(plan.copiedWeeks) + ', unclear names ' + n(plan.unclear) +
    '. Written beside each file in the ' + QUEUE_TAB + ' tab' +
    (apply ? '.' : '; nothing changed, run autoTriageApply() to act.'));
}

// Writes fixed? / fix notes / fix finished at beside every file, and hands back the findings
// that belong to no file at all.
function writeTriageOntoQueue_(plan, apply) {
  const ss = getLog_(false);
  const q = ss.getSheetByName(QUEUE_TAB);
  const last = q.getLastRow();
  if (last < 2) return [];
  const data = q.getRange(2, 1, last - 1, QUEUE_HEADER.length).getValues();

  const pushedBy = {};   // branch|date → row indexes that pushed it
  const coversBy = {};   // branch|date → row indexes whose file NAME covers it
  data.forEach(function (r, i) {
    String(r[6] || '').split(' ').filter(String).forEach(function (d) {
      const k = r[3] + '|' + d;
      (pushedBy[k] = pushedBy[k] || []).push(i);
    });
    const wk = weekFromName_(r[1], r[2]);
    if (!wk) return;
    for (let iso = wk.from; iso <= wk.to; iso = isoAdd_(iso, 1)) {
      const k = r[3] + '|' + iso;
      (coversBy[k] = coversBy[k] || []).push(i);
    }
  });

  const fixedNotes = data.map(function () { return []; });
  const openNotes  = data.map(function () { return []; });
  const orphans = [];
  const attribute = function (index, branch, date, text, isFix, label) {
    const rows = index[branch + '|' + date];
    if (!rows || !rows.length) { orphans.push([label, branch, date, text]); return; }
    rows.forEach(function (i) { (isFix ? fixedNotes : openNotes)[i].push(text); });
  };

  // the two that span many dates: one note per file, counting only that file's own days
  plan.placeholders.forEach(function (p) {
    const per = {};
    Object.keys(p.dates).forEach(function (d) {
      const rows = pushedBy[p.branch + '|' + d];
      if (!rows || !rows.length) { orphans.push(['template column', p.branch, d, p.name]); return; }
      rows.forEach(function (i) { per[i] = (per[i] || 0) + 1; });
    });
    Object.keys(per).forEach(function (i) {
      fixedNotes[i].push('removed template column ' + p.name + ' (' + per[i] + (per[i] === 1 ? ' day' : ' days') + ')');
    });
  });
  plan.archived.forEach(function (a) {
    const per = {};
    Object.keys(a.dates).forEach(function (k) {
      const rows = pushedBy[k]; const parts = k.split('|');
      if (!rows || !rows.length) { orphans.push(['archived marker', parts[0], parts[1], a.from + ' to ' + a.to]); return; }
      rows.forEach(function (i) { per[i] = (per[i] || 0) + 1; });
    });
    Object.keys(per).forEach(function (i) {
      fixedNotes[i].push('dropped the (A) from ' + a.from + ' (' + per[i] + (per[i] === 1 ? ' day' : ' days') + ')');
    });
  });
  plan.caseVariants.forEach(function (c) {
    const per = {};
    Object.keys(c.dates).forEach(function (k) {
      const rows = pushedBy[k];
      const parts = k.split('|');
      if (!rows || !rows.length) { orphans.push(['spelling', parts[0], parts[1], c.from.join(', ') + ' to ' + c.to]); return; }
      rows.forEach(function (i) { per[i] = (per[i] || 0) + 1; });
    });
    Object.keys(per).forEach(function (i) {
      fixedNotes[i].push(c.from.join(' and ') + ' written as ' + c.to + ' (' + per[i] +
                         (per[i] === 1 ? ' day' : ' days') + ')');
    });
  });
  plan.renames.forEach(function (r) {
    const per = {};
    Object.keys(r.dates).forEach(function (d) {
      const rows = pushedBy[r.branch + '|' + d];
      if (!rows || !rows.length) { orphans.push(['name', r.branch, d, r.from + ' to ' + r.to]); return; }
      rows.forEach(function (i) { per[i] = (per[i] || 0) + 1; });
    });
    Object.keys(per).forEach(function (i) {
      fixedNotes[i].push(r.from + ' renamed to ' + r.to + ' (' + per[i] + (per[i] === 1 ? ' day' : ' days') + ')');
    });
  });

  // the three that are one date each
  plan.closures.forEach(function (c) {
    attribute(pushedBy, c.branch, c.date, 'recorded ' + c.date + ' as closed, nobody traded', true, 'closed day');
  });
  plan.copiedWeeks.forEach(function (c) {
    attribute(pushedBy, c.branch, c.date, 'figures on ' + c.date + ' but the till was quiet, ' +
      c.stylists + ' stylists, check the dates on this week', false, 'copied week');
  });
  plan.missingDays.forEach(function (m) {
    attribute(coversBy, m.branch, m.date, 'no ledger for ' + m.date + ', ' + m.stylists +
      ' stylists in Phorest', false, 'missing day');
  });

  const stamp = new Date();
  const out = data.map(function (r, i) {
    const fixes = fixedNotes[i], open = openNotes[i];
    if (!fixes.length && !open.length) return ['', '', ''];
    const notes = (fixes.length ? (apply ? '' : 'would: ') + fixes.join('; ') : '') +
                  (fixes.length && open.length ? ' — ' : '') +
                  (open.length ? 'needs you: ' + open.join('; ') : '');
    const flag = fixes.length ? (open.length ? 'partly' : 'yes') : 'no';
    return [flag, notes, fixes.length && apply ? stamp : ''];
  });
  q.getRange(2, 11, out.length, 3).setValues(out);
  SpreadsheetApp.flush();
  return orphans;
}

function applyTriage_(plan) {
  const acted = { rowsDeleted: 0, rowsRenamed: 0, closuresWritten: 0 };
  plan.placeholders.forEach(function (p) {
    supaDelete_('branch_staff_daily',
      'branch=eq.' + encodeURIComponent(p.branch) + '&staff_name=eq.' + encodeURIComponent(p.name));
    acted.rowsDeleted += p.rows;
  });
  // One patch per odd spelling, every branch at once, inside the year.
  plan.archived.forEach(function (a) {
    supaPatch_('phorest_staff_daily', 'employee_name=eq.' + encodeURIComponent(a.from), { employee_name: a.to });
    acted.rowsRenamed += a.rows;
  });
  plan.caseVariants.forEach(function (c) {
    c.from.forEach(function (v) {
      supaPatch_('branch_staff_daily', 'staff_name=eq.' + encodeURIComponent(v), { staff_name: c.to });
    });
    acted.rowsRenamed += c.rows;
  });
  plan.renames.forEach(function (r) {
    supaPatch_('branch_staff_daily',
      'branch=eq.' + encodeURIComponent(r.branch) + '&staff_name=eq.' + encodeURIComponent(r.from),
      { staff_name: r.to });
    acted.rowsRenamed += r.days;
  });
  if (plan.closures.length) {
    supaUpsert_('closed_days?on_conflict=branch,date', plan.closures.map(function (c) {
      return { branch: c.branch, date: c.date, why: 'no trading', detected_from: 'triage' };
    }));
    acted.closuresWritten = plan.closures.length;
  }
  return acted;
}

// Only what could not be pinned to a file, plus the count of everything.
function writeTriageTab_(plan, acted, orphans) {
  const ss = getLog_(false);
  const name = 'TRIAGE ' + YEAR;
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  const out = [];
  out.push([(acted ? 'APPLIED ' : 'DRY RUN, nothing changed — ') + new Date(), '', '', '']);
  out.push(['FIXED: ' + plan.placeholders.length + ' template columns, ' + plan.archived.length +
            ' archived markers, ' + plan.caseVariants.length + ' spellings, ' + plan.renames.length +
            ' renames.  FOR A PERSON: ' + plan.missingDays.length + ' missing days, ' +
            plan.copiedWeeks.length + ' copied weeks, ' + plan.unclear.length + ' unclear names.',
            '', '', '']);
  if (acted) {
    out.push(['deleted ' + acted.rowsDeleted + ' rows, renamed ' + acted.rowsRenamed +
              ', recorded ' + acted.closuresWritten + ' closures', '', '', '']);
  }
  out.push(['', '', '', '']);
  out.push(['NAMES THAT MAY OR MAY NOT PAIR — add to NAME_FIXES once you know', '', '', '']);
  out.push(['branch', 'in Phorest, not in the ledger', 'in the ledger, not in Phorest', '']);
  plan.unclear.forEach(function (u) { out.push([u.branch, u.phorest, u.ledger, '']); });
  out.push(['', '', '', '']);
  out.push(['BELONGS TO NO FILE IN THE QUEUE', '', '', '']);
  out.push(['what', 'branch', 'date', 'detail']);
  orphans.forEach(function (o) { out.push(o); });
  sh.getRange(1, 1, out.length, 4).setValues(out);
  sh.getRange(5, 1).setFontWeight('bold');
  sh.getRange(6, 1, 1, 3).setFontWeight('bold');
  sh.getRange(out.length - orphans.length - 1, 1).setFontWeight('bold');
}

// ── the Supabase writes the triage needs, alongside pushRows_'s own ──
function supaHeaders_() { return { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }; }

function supaYearRange_() { return '&date=gte.' + YEAR + '-01-01&date=lte.' + YEAR + '-12-31'; }

function supaDelete_(table, filter) {
  const resp = UrlFetchApp.fetch(SUPA_URL + '/rest/v1/' + table + '?' + filter + supaYearRange_(),
    { method: 'delete', headers: Object.assign({ Prefer: 'return=minimal' }, supaHeaders_()),
      muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) {
    throw new Error('triage delete failed (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
  }
}

function supaPatch_(table, filter, patch) {
  const resp = UrlFetchApp.fetch(SUPA_URL + '/rest/v1/' + table + '?' + filter + supaYearRange_(),
    { method: 'patch', contentType: 'application/json',
      headers: Object.assign({ Prefer: 'return=minimal' }, supaHeaders_()),
      payload: JSON.stringify(patch), muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) {
    throw new Error('triage rename failed (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
  }
}

function supaUpsert_(path, rows) {
  const resp = UrlFetchApp.fetch(SUPA_URL + '/rest/v1/' + path, {
    method: 'post', contentType: 'application/json',
    headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, supaHeaders_()),
    payload: JSON.stringify(rows), muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) {
    throw new Error('triage upsert failed (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// SUPABASE (identical behaviour to sync-all-branches.gs: dedupe, delete each date, insert fresh)
// ══════════════════════════════════════════════════════════════════════════════════════════

function pushRows_(branchCode, rows) {
  // Last one wins, EXCEPT for ASSISTANTS, which is added up. Two shared columns can land on one
  // day tab - SAA's 31 May 2025 carries MAY/xav and MYRA/APOL side by side - and both now
  // normalise to the same name, so the plain overwrite would have thrown one column's figures
  // away in silence. They are two different columns of one bucket, not one column read twice, so
  // the figures belong together. BUSINESS is the same kind of bucket and Fratelli's tabs carry
  // it twice (BUSINESS beside business), so it is added up too (Kate, 7 Sep 2026). Every other
  // name keeps the old behaviour: a name repeated in one day tab is a mistake in the tab, and
  // doubling it would invent visits (Kate, 4 Sep 2026).
  const deduped = new Map();
  rows.forEach(function (r) {
    const key = `${r.date}|${r.dept}|${r.staff_name}`;
    const seen = deduped.get(key);
    if (seen && (r.staff_name === 'ASSISTANTS' || r.staff_name === 'BUSINESS')) {
      ['ncr', 'req', 'salon', 'new_client', 'rebooked', 'total', 'treatment_aed',
       'retail_unit_qty', 'treatments_unit_qty'].forEach(function (f) {
        seen[f] = (Number(seen[f]) || 0) + (Number(r[f]) || 0);
      });
      seen.treatment_aed = Math.round(seen.treatment_aed * 100) / 100;
      return;
    }
    deduped.set(key, r);
  });
  const uniqueRows = [...deduped.values()];
  if (!uniqueRows.length) return 0;

  const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
  const datesCovered = [...new Set(uniqueRows.map(r => r.date))];
  const DATE_CHUNK = 50;
  for (let i = 0; i < datesCovered.length; i += DATE_CHUNK) {
    const chunk = datesCovered.slice(i, i + DATE_CHUNK);
    const del = UrlFetchApp.fetch(
      `${SUPA_URL}/rest/v1/branch_staff_daily?branch=eq.${encodeURIComponent(branchCode)}&date=in.(${chunk.join(',')})`,
      { method: 'delete', headers: Object.assign({ Prefer: 'return=minimal' }, headers), muteHttpExceptions: true }
    );
    if (del.getResponseCode() >= 300) throw new Error(`Supabase delete failed (${del.getResponseCode()}): ${del.getContentText()}`);
  }

  const CHUNK = 500;
  for (let i = 0; i < uniqueRows.length; i += CHUNK) {
    const chunk = uniqueRows.slice(i, i + CHUNK);
    const resp = UrlFetchApp.fetch(
      `${SUPA_URL}/rest/v1/branch_staff_daily?on_conflict=branch,date,dept,staff_name`,
      {
        method: 'post',
        contentType: 'application/json',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, headers),
        payload: JSON.stringify(chunk),
        muteHttpExceptions: true,
      }
    );
    if (resp.getResponseCode() >= 300) throw new Error(`Supabase push failed (${resp.getResponseCode()}): ${resp.getContentText()}`);
  }
  return uniqueRows.length;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════════════════

function walk_(folder, path, branch, out) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const mime = f.getMimeType();
    if (mime === MimeType.GOOGLE_SHEETS || mime === XLSX_MIME) {
      out.push({ id: f.getId(), name: f.getName(), path: path, branch: branch, mime: mime });
    }
  }
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    walk_(sub, `${path} / ${sub.getName()}`, branch, out);
  }
}

function getLog_(reset) {
  // LOG_ID is the one log file. LOG_ID_<YEAR> is the old per-year property: read it once so an
  // existing run keeps its own file and rows instead of starting a second one.
  let id = LOG_FILE_ID || PROP.getProperty('LOG_ID') || PROP.getProperty('LOG_ID_' + YEAR);
  let ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(LOG_TITLE);
    reset = true;
  }
  PROP.setProperty('LOG_ID', ss.getId());
  if (ss.getName() !== LOG_TITLE) ss.rename(LOG_TITLE);

  let q = ss.getSheetByName(QUEUE_TAB);
  if (!q && !reset) {
    // Continuing a run made before the per-year tabs existed: its rows are still on "QUEUE".
    // Only ever adopted when resuming, so a fresh backfillStart for another year can never
    // rename and wipe the tab holding a finished year.
    const legacy = ss.getSheetByName('QUEUE');
    if (legacy) { legacy.setName(QUEUE_TAB); q = legacy; }
  }
  if (!q) { q = ss.insertSheet(QUEUE_TAB); reset = true; }

  if (reset) {
    q.clearContents();
    q.getRange(1, 1, 1, QUEUE_HEADER.length).setValues([QUEUE_HEADER]).setFontWeight('bold');
    q.setFrozenRows(1);
    const rep = ss.getSheetByName(REPORT_TAB);
    if (rep) rep.clearContents();
  }
  return ss;
}

// Clears FAILED rows back to pending, once per backfillStart. Returns whether it cleared any,
// so the caller knows to arm another slice rather than declare the run finished.
function retryFailedOnce_(q, failed) {
  if (PROP.getProperty(RETRY_FLAG) === '1') return false;
  if (!failed || !failed.length) return false;
  failed.forEach(function (row) { q.getRange(row, 6, 1, 5).clearContent(); });
  SpreadsheetApp.flush();
  PROP.setProperty(RETRY_FLAG, '1');
  Logger.log('Reset ' + failed.length + ' FAILED row(s) for one more attempt.');
  return true;
}

function scheduleContinue_() {
  deleteContinueTriggers_();
  ScriptApp.newTrigger('backfillContinue').timeBased().after(60 * 1000).create();
}

function deleteContinueTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backfillContinue')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// A1 is normally a real date; some tabs hold text like "06/01/2025" (dd/mm/yyyy).
function readDate_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return v;
  const s = str_(v);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function fmt_(d, tz) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }

function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

// Numbers come through as numbers; text like "AED830.00", "1,250", " - ", "#DIV/0!" → parsed or 0.
function num_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const t = str_(v).replace(/AED/gi, '').replace(/,/g, '').trim();
  if (!t || t === '-' || t.charAt(0) === '#') return 0;
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

// The named-but-empty columns a template ships with. 2025 tabs run AA BB XX, 2024 tabs run
// Aa Bb Cc Dd Ee Ff Gg Hh II, so match the shape rather than extend a list for ever: ONE letter
// repeated up to four times with an optional trailing digit. The repeat is what makes it a
// placeholder, so the letter is captured and then backreferenced; ([A-Z]){0,3} looked the same
// and was not, because it matches any three letters and so swallowed IVY, MAY, MJ, EDS and KIM.
// Only ever consulted for a block whose every figure is zero, which is why it had not been felt
// yet: the rows in Supabase were pushed before the regex replaced the list. Re-running the
// backfill with the old expression would have dropped 1,302 all-zero days belonging to those
// five (Kate, 4 Sep 2026).
function isPlaceholder_(name) {
  const n = str_(name).toUpperCase();
  if (PLACEHOLDERS.indexOf(n) !== -1) return true;
  return /^([A-Z])\1{0,3}[0-9]?$/.test(n);
}

// The template's own vocabulary, never a person. A block's name is read one row ABOVE the
// section's "Client | Type" header, and on the second section that row lands on the tail of the
// first section's structure. KCA's 2 - 4 January 2026 tabs are the clear case: the Beauty header
// runs the full 64 columns, the four left blocks are MIMI GRACE STELLA KIMBERLY, and the right
// blocks carry "TOTALS", "Client" and a merged "GRAND TOTAL\n(CHECKING)" where a name should be.
// Every one is all-zero, so only the name gives it away, and `name.charAt(0) === '#'` caught the
// #REF! ones and nothing else. Each label was arriving in branch_staff_daily as a stylist, seven
// columns of it deduped by pushRows_ into one phantom per day.
//
// A list, not a shape: unlike isPlaceholder_ these are real words, and a rule loose enough to
// guess them would eat real names. Whitespace is collapsed first so the merged two-line cell is
// caught, and GRAND TOTAL is matched as a prefix because the template hangs "(CHECKING)" and
// "(HAIR)" off it (Kate, 4 Sep 2026).
const BLOCK_LABELS = ['CLIENT', 'TYPE', 'SERVICE', 'AMOUNT', 'COUNT', 'TOTAL', 'TOTALS',
                      'SALES', 'RETAIL', 'TREATMENT', 'COST', 'STAFF', 'REBOOKED',
                      'QTY RETAIL', 'QTY TREATMENT', 'TOTAL RETAIL', 'TOTAL RETAIL QTY',
                      // The roll-up rows the 2025 tabs hang under the Beauty section. Stored as
                      // staff on 45 KCA days and a handful at AQ and MC before this (Kate, 7 Sep 2026).
                      'TOTAL CLIENTS', 'HAIR RETAIL SALES', 'BEAUTY RETAIL SALES', 'RETAIL SALES',
                      'TREATMENT SALES'];
// BUSINESS and EXTENSIONS are NOT labels: they are the template's own buckets and carry real
// retail and visit figures, so they stay as rows (Kate, 7 Sep 2026).

function isLabel_(name) {
  const n = str_(name).toUpperCase().replace(/\s+/g, ' ');
  if (BLOCK_LABELS.indexOf(n) !== -1) return true;
  return n.indexOf('GRAND TOTAL') === 0;
}

// A column headed with two or three names divided by a slash is the assistants' column, never one
// stylist: SAA's MYRA/APOL, MYRA/MICHELLE, MYRA/KATHY, MYRA/MAY, MYRA/MARIA, MYRA/APOL/XAVRINA,
// MARIA/APOL, MAY/xav, and KCA's ESTHER/PEARL and CHONA/ ESTHER. Kate settled it on 4 Sep 2026:
// automatically assistants. So they join the ASSISTANTS bucket every branch already keeps, rather
// than standing as ten phantom stylists splitting 81 visits between them and diluting the real
// per-stylist averages.
//
// Only the slash is read as the divider, because it is the only one the ledgers actually use, and
// case is irrelevant, so "MAY/xav" is the same shape as "MYRA/APOL". An ampersand or a plus would
// be a rule invented ahead of any data asking for it.
//
// Note the names inside a slash are often real stylists in their own right elsewhere (SAA's MYRA
// carries 258 rows of her own, MAY 75, KCA's CHONA 99). That is not a contradiction: somebody can
// assist on one day and hold her own column on another. Only the shared column becomes ASSISTANTS.
function isSharedColumn_(name) { return str_(name).indexOf('/') !== -1; }

function normalizeStaffName_(name) {
  const trimmed = str_(name);
  if (isSharedColumn_(trimmed)) return 'ASSISTANTS';
  return NAME_FIXES[trimmed.toUpperCase()] || trimmed;
}
