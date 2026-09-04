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
 *  7. Then run reconcile(): checks the year against Phorest, whose dates come from the till, and
 *     writes a "RECONCILE <year>" tab listing only the days worth looking at.
 *
 * TO RE-RUN FOR ANOTHER SCOPE (e.g. one branch, one month, another year)
 *  Change YEAR to a year listed in ROOTS_BY_YEAR, then run backfillStart() again. It clears that
 *  year's queue tab only. For a narrower scope, pass a smaller ROOTS by editing that year's entry.
 *  Pushing the same dates twice is harmless: every (branch, date) is deleted then re-inserted.
 *
 * WHAT IT DELIBERATELY SKIPS (all logged as SKIPPED / WARN, never silently)
 *  - Files whose name starts with "Copy of" (duplicates; decide by hand which one is real).
 *  - Day tabs whose A1 date is outside YEAR (e.g. the Dec days inside a "Dec 30 - Jan 5" week).
 *    A blank or 1899/1900 A1 is NOT this: that date is filled in from the rest of the week.
 *  - Day tabs whose A1 date falls on a different weekday than the tab name says AND lands outside
 *    the week the rest of the file covers (a genuinely stale copied week). One inside that week is
 *    a slipped date formula, and is corrected to the day its tab name asks for rather than skipped.
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
  2025: {
    SAA: '1PAHi6DCHX5MFZeOAU0dbVxPFzV2Ib1ly', // SAADIYAT / WEEKLY LEDGERS
    KCA: '1t7SCQxkd8q0-otw-L2m9xVgkO6qHqR-6', // KHALIFA / WEEKLY LEDGERS          (.xlsx)
    MC:  '1CbFpjAeMCuncah6cN4nXxixE4Ktwu66X', // MOTOR CITY 2025 / WEEK END-2025
    AQ:  '1qZz8vidhNDkGSXyP1JLfBSZzJnZolRLX', // AL QUOZ / TARA ROSE / WEEKEND     (.xlsx)
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
  'LIZANNIE': 'Lizanie',
  'SHELLY': 'Shelley',
  'HAZEL MAY': 'Hazel Mae',
  'ASISSTANTS': 'ASSISTANTS',
  // Both spellings sit in AQ's own 2025 tabs for one person; Phorest has XYRHY UNISA.
  'XYHRY': 'XYRHY',
};

// One log file for every year; each year gets its own tab, named after the year, and its own
// REPORT tab. Running 2024 therefore leaves the 2025 tab alone (Kate, 3 Sep 2026).
const LOG_TITLE = 'LEDGER BACKFILL — log';
const QUEUE_TAB = String(YEAR);
const REPORT_TAB = `REPORT ${YEAR}`;
const QUEUE_HEADER = ['file_id', 'name', 'path', 'branch', 'mime', 'status', 'dates', 'rows', 'note', 'finished_at'];
const PROP = PropertiesService.getScriptProperties();

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
     .setValues(queue.map(e => [e.id, e.name, e.path, e.branch, e.mime, '', '', '', '', '']));
  }
  Logger.log(`Queued ${queue.length} weekly files for ${YEAR}. Log sheet: ${ss.getUrl()}`);
  backfillContinue();
}

/** Step 2 (automatic). Processes pending queue rows until the time budget runs out, then re-arms itself. */
function backfillContinue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('Another slice is still running; skipping.'); return; }
  try {
    const started = Date.now();
    const ss = getLog_(false);
    const q = ss.getSheetByName(QUEUE_TAB);
    const last = q.getLastRow();
    if (last < 2) { Logger.log('Queue is empty. Run backfillStart() first.'); return; }
    const data = q.getRange(2, 1, last - 1, QUEUE_HEADER.length).getValues();
    let pending = 0, doneThisRun = 0;

    for (let i = 0; i < data.length; i++) {
      if (data[i][5]) continue; // status already set
      pending++;
      if (Date.now() - started > TIME_BUDGET_MS) continue; // out of time; leave for next slice

      const entry = { id: data[i][0], name: data[i][1], path: data[i][2], branch: data[i][3], mime: data[i][4] };
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
      pending--; doneThisRun++;
    }

    if (pending > 0) {
      scheduleContinue_();
      Logger.log(`Slice done: ${doneThisRun} files this run, ${pending} still pending. Next slice in ~1 minute.`);
    } else {
      deleteContinueTriggers_();
      Logger.log(`ALL DONE. ${doneThisRun} files this run. Now run backfillReport(). Log: ${ss.getUrl()}`);
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

/** Emergency stop: removes the self-re-arming trigger. Pending rows stay pending. */
function backfillStop() {
  deleteContinueTriggers_();
  Logger.log('Stopped. Run backfillContinue() to resume where it left off.');
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ONE FILE
// ══════════════════════════════════════════════════════════════════════════════════════════

function processFile_(entry) {
  if (SKIP_FILE.test(entry.name)) {
    return { status: 'SKIPPED', dates: [], rows: 0, note: '"Copy of" duplicate — check by hand which version is real' };
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
    const days = [];
    ss.getSheets().forEach(sheet => {
      const tab = sheet.getName().trim().toUpperCase();
      if (DAY_TABS.indexOf(tab) === -1) return;
      const lastRow = Math.min(sheet.getLastRow(), MAX_ROWS_READ);
      const lastCol = sheet.getLastColumn();
      if (lastRow < 5 || lastCol < 4) return;
      const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      days.push({ tab: tab, values: values, date: readDate_(values[0][0], tz) });
    });

    const monday = weekMonday_(days, tz, notes);

    days.forEach(day => {
      const tab = day.tab;
      let date = day.date;
      // Blank, or one of the 1899-12-31 / 1900-01-01 serials an empty cell formats into. A real
      // date from the neighbouring year (a Dec 30 - Jan 5 week) is NOT this, and is left alone.
      const unfilled = !date || date.getFullYear() < 1990;
      let derived = false;
      if (unfilled) {
        if (!monday) { notes.push(`${tab}: no date in A1 and the week could not be worked out, skipped`); return; }
        date = new Date(monday.getTime());
        date.setDate(date.getDate() + DAY_TABS.indexOf(tab));
        derived = true;
      }
      if (date.getFullYear() !== YEAR) { notes.push(`${tab}: ${fmt_(date, tz)} outside ${YEAR}, skipped`); return; }
      let weekday = Utilities.formatDate(date, tz, 'EEEE').toUpperCase();
      // A1 on the wrong weekday splits two ways, and the file's own week tells them apart.
      // Inside this file's week: the A1s are "the day before, plus one" formulas and one of them
      // slipped, so the week is not in doubt, only the offset. Take the date the tab name asks
      // for. Outside it: the tab really is a copy of another week and is skipped, as before.
      if (weekday !== tab && monday && withinWeek_(date, monday)) {
        const was = fmt_(date, tz);
        date = new Date(monday.getTime());
        date.setDate(date.getDate() + DAY_TABS.indexOf(tab));
        weekday = Utilities.formatDate(date, tz, 'EEEE').toUpperCase();
        notes.push(`${tab}: A1 said ${was}, a ${weekday === tab ? 'shifted' : 'wrong'} day inside this week, corrected to ${fmt_(date, tz)}`);
      }
      if (weekday !== tab) { notes.push(`WARN ${tab}: A1 says ${fmt_(date, tz)} which is a ${weekday} — stale copy? skipped`); return; }

      const dateStr = fmt_(date, tz);
      if (derived) notes.push(`${tab}: A1 was blank, dated ${dateStr} from the rest of the week`);
      const rows = parseDay_(day.values, dateStr, tab, notes);
      if (!rows.length) { notes.push(`${tab} ${dateStr}: no staff rows`); return; }
      dates.push(dateStr);
      allRows.push(...rows.map(r => Object.assign({ branch: entry.branch }, r)));
    });

    if (!allRows.length) return { status: 'EMPTY', dates: [], rows: 0, note: notes.join(' | ') };
    const pushed = pushRows_(entry.branch, allRows);
    return { status: 'OK', dates: dates.sort(), rows: pushed, note: notes.join(' | ') };
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

// The Monday of the week a file covers, from whichever day tabs carry a date that is real,
// inside YEAR, and lands on the weekday its own tab name claims. Every such tab implies the
// same Monday. If they disagree the file is a mix of weeks and nothing is filled in.
function weekMonday_(days, tz, notes) {
  const seen = {};
  days.forEach(day => {
    const d = day.date;
    if (!d || d.getFullYear() !== YEAR) return;
    if (Utilities.formatDate(d, tz, 'EEEE').toUpperCase() !== day.tab) return;
    const m = new Date(d.getTime());
    m.setDate(m.getDate() - DAY_TABS.indexOf(day.tab));
    const k = fmt_(m, tz);
    seen[k] = (seen[k] || 0) + 1;
  });
  const keys = Object.keys(seen);
  if (keys.length > 1) {
    notes.push(`WARN the day tabs point at ${keys.length} different weeks (${keys.join(', ')}); no dates filled in`);
    return null;
  }
  if (!keys.length) return null;
  const p = keys[0].split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

// True when a date falls inside the Monday-to-Sunday week that starts at monday.
function withinWeek_(date, monday) {
  const days = Math.round((date.getTime() - monday.getTime()) / 86400000);
  return days >= 0 && days <= 6;
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
      if (!name || name.charAt(0) === '#') continue;

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
// SUPABASE (identical behaviour to sync-all-branches.gs: dedupe, delete each date, insert fresh)
// ══════════════════════════════════════════════════════════════════════════════════════════

function pushRows_(branchCode, rows) {
  const deduped = new Map();
  rows.forEach(r => deduped.set(`${r.date}|${r.dept}|${r.staff_name}`, r));
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
// Aa Bb Cc Dd Ee Ff Gg Hh II, so match the shape rather than extend a list for ever: one letter
// repeated up to four times with an optional trailing digit. Only ever consulted for a block
// whose every figure is zero, so a real stylist on a quiet day is never dropped, and a two
// letter name like MJ is not a repeat and never matches.
function isPlaceholder_(name) {
  const n = str_(name).toUpperCase();
  if (PLACEHOLDERS.indexOf(n) !== -1) return true;
  return /^([A-Z]){0,3}[0-9]?$/.test(n);
}

function normalizeStaffName_(name) {
  const trimmed = str_(name);
  return NAME_FIXES[trimmed.toUpperCase()] || trimmed;
}
