/**
 * STANDALONE script — do NOT paste this into any branch spreadsheet's Apps Script.
 * Create it once at script.google.com/create (or Apps Script > New project, not from
 * inside a Sheet), paste this whole file in, confirm LEDGERS_DAILY_FOLDER_ID below,
 * then run syncAllBranches() once to test, then setupDailyTrigger() once to automate.
 *
 * Auto-discovers every branch spreadsheet by walking LEDGERS_DAILY_FOLDER_ID's month
 * subfolders (012026 JANUARY, 022026 FEBRUARY, ...), and for each spreadsheet found:
 *   1. Rebuilds its _temp_placeholder tab from that file's own date tabs (same logic
 *      as the per-branch buildStylistDailyLog() menu function in each sheet).
 *   2. Pushes the rebuilt _temp_placeholder to Supabase.
 * Branch is detected from the filename itself (same keyword matching the dashboard's
 * Upload Portal already uses: "KHALIFA"→KCA, "AL QUOZ"→AQ, etc.) — nothing to edit
 * here when a new month or branch shows up, as long as it lands somewhere under this
 * same folder tree.
 *
 * The per-branch buildStylistDailyLog() bound to each sheet (wired to its "Daily Log"
 * menu) can stay if you still want a quick manual rebuild+preview button for a single
 * branch — it doesn't conflict with this; rebuilding twice is harmless and the push
 * here upserts, so nothing gets duplicated.
 *
 * First run will prompt for Drive access too (broader than just Sheets) — that's
 * expected, since it needs to list files/folders, not just read one spreadsheet.
 */

// ── EDIT ONCE: the "LEDGERS-daily" folder — one level above the month folders ──
const LEDGERS_DAILY_FOLDER_ID = '1Aw15FcBgtjiIafPzwDwZpxoedaWluG-j';
const SHEET_NAME = '_temp_placeholder';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STOP_LABELS = ['HAIR RETAIL SALES', 'TREATMENT SALES', 'COL TAKE AED', 'CBD TAKE AED', 'BEAUTY SALES', 'BEAUTY RETAIL SALES', 'RETAIL SALES', 'NET SALON TAKE'];
// Label cells that are the whole word, not the start of a longer phrase. Kept
// separate so STOP_LABELS keeps meaning "a row that begins with this".
const BARE_LABELS = ['RETAIL', 'TREATMENT', 'TREATMENTS', 'SERVICES', 'SUBTOTAL', 'GRAND TOTAL'];

const BRANCH_DETECT = {
  KCA: ['khalifa', 'kca'],
  SAA: ['saadiyat', 'saa'],
  MC:  ['motor city', 'motor', 'mc'],
  AQ:  ['al quoz', 'quoz', 'aq'],
  FRT: ['fratelli', 'frt', 'barber'],
};

// Known misspellings/duplicate spellings → canonical staff name.
// Add more pairs here anytime someone's name shows up split across two spellings
// in the daily tabs — key is the WRONG spelling (case-insensitive), value is correct.
const NAME_FIXES = {
  'LIZANNIE': 'Lizanie',
  'SHELLY': 'Shelley',
  'HAZEL MAY': 'Hazel Mae',
};
// ─────────────────────────────────────────────────────────────────────────

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';

function detectBranch_(fileName) {
  const lower = fileName.toLowerCase();
  for (const [code, kws] of Object.entries(BRANCH_DETECT)) {
    if (kws.some(kw => lower.indexOf(kw) !== -1)) return code;
  }
  return null;
}

function syncAllBranches() {
  const root = DriveApp.getFolderById(LEDGERS_DAILY_FOLDER_ID);
  const monthFolders = root.getFolders();
  const results = [];

  while (monthFolders.hasNext()) {
    const monthFolder = monthFolders.next();
    const files = monthFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (files.hasNext()) {
      const file = files.next();
      const branchCode = detectBranch_(file.getName());
      if (!branchCode) {
        results.push(`SKIP (no branch match) — ${monthFolder.getName()} / ${file.getName()}`);
        continue;
      }
      try {
        const ss = SpreadsheetApp.openById(file.getId());
        const builtCount = buildStylistDailyLog_(ss);
        const pushedCount = pushOneBranch_(ss, branchCode);
        results.push(`${monthFolder.getName()} / ${file.getName()} → ${branchCode}: built ${builtCount}, pushed ${pushedCount}`);
      } catch (e) {
        results.push(`${monthFolder.getName()} / ${file.getName()} → ${branchCode}: FAILED — ${e.message}`);
      }
    }
  }

  Logger.log(results.join('\n'));
}

// Rebuilds _temp_placeholder from this spreadsheet's own date tabs. Same logic as
// the per-branch buildStylistDailyLog() menu function, parameterized on `ss` instead
// of SpreadsheetApp.getActiveSpreadsheet() so it can run against any file by ID.
function buildStylistDailyLog_(ss) {
  const dateSheets = ss.getSheets()
    .filter(s => DATE_PATTERN.test(s.getName()))
    .sort((a, b) => a.getName().localeCompare(b.getName()));

  const rows = [];
  dateSheets.forEach(sheet => {
    const dateLabel = sheet.getName();
    const data = sheet.getDataRange().getValues();
    let dept = null; // null → 'Hair' on the 1st header row → 'Beauty' on the 2nd

    for (let r = 0; r < data.length; r++) {
      const staff = data[r][0]; // column A

      // A header/separator row always has literal "REQ" in column C, even on
      // rows where the STAFF cell itself is broken — more reliable than
      // matching "STAFF" text directly.
      if (String(data[r][2]).trim().toUpperCase() === 'REQ') {
        dept = dept === null ? 'Hair' : 'Beauty';
        continue;
      }

      if (!staff) continue;
      const staffUpper = String(staff).trim().toUpperCase();
      if (staffUpper === 'NET SALON TAKE') break; // true end of the day's data — after both departments

      // A staff cell with no letter in it is not a person. Saadiyat's Beauty tabs
      // carry a stray ']' that passed every test below and sent 165 rows to
      // Supabase, each with a retail figure sitting in column B.
      if (!/[A-Za-z]/.test(staffUpper)) continue;

      // STOP_LABELS was matched with indexOf === 0 only, so a cell reading exactly
      // 'RETAIL' slipped past 'RETAIL SALES' — the list holds the longer forms.
      // Equality is checked as well now, and the bare label names are listed.
      if (staffUpper.indexOf('TOTAL') === 0
       || STOP_LABELS.some(l => staffUpper === l || staffUpper.indexOf(l) === 0)
       || BARE_LABELS.indexOf(staffUpper) !== -1) continue; // per-department summary row — skip it, Beauty's header may still be ahead
      if (!dept) continue; // safety: haven't hit a header row yet

      const row = data[r];
      const newClientReq = row[1];  // B
      const req           = row[2]; // C
      const salon         = row[3]; // D
      const newClients    = row[4]; // E
      const rebooked      = row[5]; // F
      const total         = row[7]; // H

      // Backstop for labels nobody has thought of yet. A row that served no one
      // cannot report a new client request, so a figure in column B with no
      // client counts anywhere is money on a label row, not a stylist's day.
      var servedSomeone = [req, salon, newClients, rebooked, total]
        .some(function (v) { return Number(v) > 0; });
      if (!servedSomeone && Number(newClientReq) > 0) continue;
      const treatment     = dept === 'Hair' ? row[33] : ''; // AH, Hair only
      const retailQty     = dept === 'Hair' ? row[23] : row[30]; // Hair: X, Beauty: AE
      const treatmentQty  = dept === 'Hair' ? row[30] : '';      // AE, Hair only

      rows.push([dateLabel, dept, normalizeStaffName_(staff), newClientReq, req, salon, newClients, rebooked, total, treatment, retailQty, treatmentQty]);
    }
  });

  const logSheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  logSheet.clearContents();
  logSheet.getRange(1, 1, 1, 12).setValues([['Date', 'Dept', 'STAFF', 'NEW CLIENT REQ', 'REQ', 'SALON', 'NEW', 'REBOOKED', 'TOTAL', 'TREATMENT AED', 'RETAIL UNIT (QTY)', 'TREATMENTS UNIT (QTY)']]);
  if (rows.length) logSheet.getRange(2, 1, rows.length, 12).setValues(rows);

  return rows.length;
}

// Pushes this spreadsheet's _temp_placeholder to Supabase.
function pushOneBranch_(ss, branchCode) {
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return 0; // no _temp_placeholder tab in this file — skip quietly

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const [dateCell, dept, staff, ncr, req, salon, newC, rebooked, total, treatmentCell, retailQtyCell, treatmentQtyCell] = r;
    if (!staff || String(staff).trim() === '') continue;

    const date = formatDate_(dateCell);
    if (!date) continue; // skip rows with no valid date

    rows.push({
      branch: branchCode,
      date: date,
      dept: String(dept || '').trim(),
      // _temp_placeholder is already normalized by buildStylistDailyLog_, but
      // normalize again here too — this function can run standalone against a
      // sheet someone edited by hand after the last rebuild.
      staff_name: normalizeStaffName_(staff),
      ncr: toNumber_(ncr),
      req: toNumber_(req),
      salon: toNumber_(salon),
      new_client: toNumber_(newC),
      rebooked: toNumber_(rebooked),
      total: toNumber_(total),
      treatment_aed: toAed_(treatmentCell),
      retail_unit_qty: toNumber_(retailQtyCell),
      treatments_unit_qty: toNumber_(treatmentQtyCell),
    });
  }

  if (!rows.length) return 0;

  // Some sheets have a duplicate (date, dept, staff) row slip in — Postgres's
  // ON CONFLICT DO UPDATE fails the whole batch if the same conflict target
  // shows up twice in one command, so dedupe here (keep the last one) before
  // sending, instead of letting one bad row sink the entire branch/month.
  const deduped = new Map();
  rows.forEach(r => deduped.set(`${r.date}|${r.dept}|${r.staff_name}`, r));
  const uniqueRows = [...deduped.values()];

  // Wipe existing rows for every (branch, date) this run covers, THEN insert fresh.
  // Upsert-only was leaving orphaned rows behind forever: a staff member removed
  // from a date's tab (or a bad push from some earlier bug/test run that got
  // mistagged with this branch code) never collides with anything this branch's
  // own current data would upsert over, so it just sits there as a phantom row.
  // Full delete-then-insert per date guarantees no stale row can survive a sync.
  const datesCovered = [...new Set(uniqueRows.map(r => r.date))];
  const DATE_CHUNK = 50; // keep each `in.()` filter list a sane size per request
  for (let i = 0; i < datesCovered.length; i += DATE_CHUNK) {
    const dateChunk = datesCovered.slice(i, i + DATE_CHUNK);
    const delResp = UrlFetchApp.fetch(
      `${SUPA_URL}/rest/v1/branch_staff_daily?branch=eq.${encodeURIComponent(branchCode)}&date=in.(${dateChunk.join(',')})`,
      {
        method: 'delete',
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          Prefer: 'return=minimal',
        },
        muteHttpExceptions: true,
      }
    );
    const delCode = delResp.getResponseCode();
    if (delCode >= 300) {
      throw new Error(`Supabase delete-before-insert failed (${delCode}): ${delResp.getContentText()}`);
    }
  }

  const CHUNK = 500;
  for (let i = 0; i < uniqueRows.length; i += CHUNK) {
    const chunk = uniqueRows.slice(i, i + CHUNK);
    const resp = UrlFetchApp.fetch(
      `${SUPA_URL}/rest/v1/branch_staff_daily?on_conflict=branch,date,dept,staff_name`,
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        payload: JSON.stringify(chunk),
        muteHttpExceptions: true,
      }
    );
    const code = resp.getResponseCode();
    if (code >= 300) {
      throw new Error(`Supabase push failed (${code}): ${resp.getContentText()}`);
    }
  }

  return uniqueRows.length;
}

// ── One-time setup: run this once to auto-sync every day ──
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncAllBranches')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncAllBranches')
    .timeBased()
    .everyDays(1)
    .atHour(22) // runs ~10pm daily — adjust to taste
    .create();

  Logger.log('Daily trigger installed for syncAllBranches().');
}

// ── helpers ──
function formatDate_(cell) {
  if (cell instanceof Date) {
    return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(cell || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toNumber_(v) {
  const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

function toAed_(v) {
  const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// Collapses known misspelled/duplicate spellings to one canonical name (see NAME_FIXES above).
function normalizeStaffName_(name) {
  const trimmed = String(name || '').trim();
  return NAME_FIXES[trimmed.toUpperCase()] || trimmed;
}
