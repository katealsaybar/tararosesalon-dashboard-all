/**
 * Bound to each branch's Google Sheet (e.g. "001 KHALIFA JANUARY 2026").
 * Pushes the _temp_placeholder tab straight to Supabase's branch_staff_daily table —
 * no download, no manual upload. Paste this into each branch spreadsheet's
 * Extensions > Apps Script, set BRANCH_CODE below, save, then run pushToSupabase()
 * once to test. Run setupDailyTrigger() once after that to make it automatic.
 *
 * _temp_placeholder columns expected (in order):
 *   Date | Dept | STAFF | NEW CLIENT REQ | REQ | SALON | NEW | REBOOKED | TOTAL | TREATMENT AED
 */

// ── EDIT PER SPREADSHEET ────────────────────────────────────────────────
const BRANCH_CODE = 'KCA'; // KCA, SAA, MC, AQ, or FRT — change per branch copy
const SHEET_NAME  = '_temp_placeholder';
// ─────────────────────────────────────────────────────────────────────────

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aWp4ZW5hZm9vd2FqcWt0cXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTA1OTksImV4cCI6MjA5MTI4NjU5OX0.GL3YXupXOBGfN4FCyelbQWraUw12VJNJu-wUB3zR7Zw';

function pushToSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found in this spreadsheet.`);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) { Logger.log('No data rows found.'); return; }

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const [dateCell, dept, staff, ncr, req, salon, newC, rebooked, total, treatmentCell] = r;
    if (!staff || String(staff).trim() === '') continue;

    const date = formatDate_(dateCell);
    if (!date) continue; // skip rows with no valid date

    rows.push({
      branch: BRANCH_CODE,
      date: date,
      dept: String(dept || '').trim(),
      staff_name: String(staff).trim(),
      ncr: toNumber_(ncr),
      req: toNumber_(req),
      salon: toNumber_(salon),
      new_client: toNumber_(newC),
      rebooked: toNumber_(rebooked),
      total: toNumber_(total),
      treatment_aed: toAed_(treatmentCell),
    });
  }

  if (!rows.length) { Logger.log('No valid staff rows to push.'); return; }

  // Batch in chunks of 500 to keep each request well under Apps Script / PostgREST limits
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
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

  Logger.log(`Pushed ${rows.length} rows for ${BRANCH_CODE}.`);
}

// ── One-time setup: run this once to auto-push every day ──
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'pushToSupabase')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('pushToSupabase')
    .timeBased()
    .everyDays(1)
    .atHour(22) // runs ~10pm daily — adjust to taste
    .create();

  Logger.log('Daily trigger installed for pushToSupabase().');
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
