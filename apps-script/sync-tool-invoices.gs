/**
 * STANDALONE script for the mailbox that receives the payment emails: info@tararosesalon.com (Kate, 25 Nov 2026). Do NOT paste it into a branch spreadsheet and do NOT
 * add it to the recruitment script, it is its own project.
 * Neither respond.io nor Phorest has an API that returns what we are billed (respond.io's Developer API is contacts and messages; Phorest's is clients, bookings and the
 * till), so the payment emails are the feed. Every hour this reads the respond.io receipts that Stripe sends (receipts@whatsapp-billing.respond.io) with GmailApp (it runs
 * AS the account: no Gmail token to store or renew) and sends each one to Tool Spend through tool_spend_import() (migrations/tool_spend_import.sql). READ ONLY: it never
 * sends, labels, archives, moves or deletes an email. Idempotent: a receipt is keyed by its own number (respond:1701-7436), so a re-read adds nothing.
 *
 * ONE-TIME SETUP (signed in as info@):
 *   1. script.google.com/create, paste this whole file, Project Settings, tick "Show appsscript.json" and replace it with sync-tool-invoices.appsscript.json
 *      (gmail.readonly is the narrowest Gmail scope: the script cannot change mail even by mistake).
 *   2. Project Settings, Script Properties, add:
 *        TSI_ANON_KEY  = the dashboard's publishable (anon) key, the same one the site uses
 *        TSI_PUSH_PASS = the push pass the other pushers use (public.push_passes, active)
 *      Nothing secret lives in this file.
 *   3. Run dryRun() once and approve the permissions. The log shows what it WOULD add (counts only, nothing is written).
 *   4. Run syncToolInvoices() once, then setupTrigger() once: installs the hourly run.
 *
 * WHAT IT READS. A receipt has a number, the amount paid, the date, and one line per thing paid for. "WABA Balance Top Up" and "Waba Balance Auto Recharged" are top-ups
 * (category topup); anything else (the Growth plan, the MAC add-on) is category plan. USD only: a receipt in another currency is logged and skipped, not guessed.
 * It starts at 20 Oct 2026 because every receipt before that was loaded by hand (the 25 Nov 2026 catch-up added 28 Oct to 24 Nov with the same keys, so those are
 * skipped, not doubled). The date is the Dubai date the receipt email arrived.
 * A receipt does not say WHICH WhatsApp balance a top-up went into, so these lines carry the branch "Unassigned"; Tool Spend shows them apart. To assign one, edit its row.
 * PHOREST is not read here: its invoices go to a mailbox this script does not run in, and an invoice email needs its own parser. See the note at the bottom.
 */

const TSI_SUPA = 'https://gvijxenafoowajqktqvd.supabase.co';
const TSI_FROM = 'receipts@whatsapp-billing.respond.io';
const TSI_START_MS = new Date('2026-10-20T00:00:00+04:00').getTime();
const TSI_OVERLAP_MS = 3 * 86400000;

function tsiProp_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Script Properties is missing ' + k + ', see the header comment.');
  return v;
}

/* ---------- entry points ---------- */
function syncToolInvoices() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.log('Another run is still going, skipping.'); return; }
  try {
    const props = PropertiesService.getScriptProperties();
    const last = Number(props.getProperty('TSI_LAST') || 0);
    const from = Math.max(TSI_START_MS, last ? last - TSI_OVERLAP_MS : TSI_START_MS);
    const started = Date.now();
    tsiRun_(from, false);
    props.setProperty('TSI_LAST', String(started));
  } finally { lock.releaseLock(); }
}
function dryRun() { tsiRun_(TSI_START_MS, true); }
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncToolInvoices') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncToolInvoices').timeBased().everyHours(1).create();
  console.log('Installed: syncToolInvoices every hour.');
}

/* ---------- reading the mailbox ---------- */
function tsiRun_(fromMs, dry) {
  const rows = [], skipped = [], seen = {};
  for (let start = 0; start < 500; start += 100) {
    const threads = GmailApp.search('from:' + TSI_FROM + ' after:' + Math.floor(fromMs / 1000), start, 100);
    threads.forEach(function (th) {
      th.getMessages().forEach(function (m) {
        const id = m.getId(); if (seen[id]) return; seen[id] = 1;
        const d = m.getDate().getTime(); if (d < fromMs) return;
        const r = tsiParseRespond_(m.getPlainBody(), d);
        if (r.skip) skipped.push(m.getSubject() + ' (' + r.skip + ')'); else rows.push.apply(rows, r.rows);
      });
    });
    if (threads.length < 100) break;
  }
  const totals = { dry: dry, receipts_read: rows.length, skipped: skipped.length, new: 0, already_there: 0, not_understood: 0 };
  for (let i = 0; i < rows.length; i += 200) {
    const res = tsiPush_(rows.slice(i, i + 200), dry);
    ['new', 'already_there', 'not_understood'].forEach(function (k) { totals[k] += res[k] || 0; });
    if (res.examples && res.examples.length) console.log('Not understood: ' + res.examples.join(' | '));
  }
  console.log(JSON.stringify(totals));
  if (skipped.length) console.log('Skipped, read these in Gmail by hand:\n' + skipped.join('\n'));
}

// One respond.io (Stripe) receipt: the plain text body and the time the email arrived (ms). Returns { rows: [...] } or { skip: 'why' }.
// Kept free of Apps Script calls so it can be tried on a pasted body.
function tsiParseRespond_(body, arrivedMs) {
  const text = String(body || '').replace(/\r/g, '');
  const num = /Receipt #(\d{3,5}-\d{3,5})/.exec(text);
  const paid = /Amount paid\s*\n\s*([^\d\s]*)\s*([\d,]+\.\d\d)/.exec(text);
  if (!num || !paid) return { skip: 'no receipt number or amount' };
  if (paid[1] !== '$') return { skip: 'not in dollars: ' + paid[1] };
  const total = Number(paid[2].replace(/,/g, ''));
  const items = [];
  const sum = text.split(/\nSummary\s*\n/)[1] || '';
  sum.split('\n').forEach(function (ln) {
    const mm = /^-\s+(?:-\s+)?(.*?)\s:\s\$([\d,]+\.\d\d)\s*$/.exec(ln.trim());
    if (mm && !/^Amount paid\b/i.test(mm[1])) items.push({ what: mm[1], usd: Number(mm[2].replace(/,/g, '')) });
  });
  if (!items.length) items.push({ what: 'respond.io payment', usd: total });
  if (Math.abs(items.reduce(function (a, x) { return a + x.usd; }, 0) - total) > 0.01) return { skip: 'lines do not add up to the amount paid' };
  const day = Utilities.formatDate(new Date(arrivedMs), 'Asia/Dubai', 'yyyy-MM-dd');
  return {
    rows: items.map(function (x, i) {
      const topup = /balance|top ?up|recharge/i.test(x.what);
      const auto = /auto/i.test(x.what);
      return {
        ext_id: 'respond:' + num[1] + (items.length > 1 ? '-' + (i + 1) : ''),
        tool: 'respond', kind: 'paid', paid_on: day, currency: 'USD', amount: x.usd,
        category: topup ? 'topup' : 'plan',
        item: topup ? (auto ? 'Auto recharge' : 'Top up') + ' (balance not named on the receipt)' : 'Plan: ' + x.what.replace(/\s+for:.*$/i, ''),
        branch: topup ? 'Unassigned' : null,
      };
    }),
  };
}

function tsiPush_(rows, dry) {
  const key = tsiProp_('TSI_ANON_KEY');
  const resp = UrlFetchApp.fetch(TSI_SUPA + '/rest/v1/rpc/tool_spend_import', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify({ p_pass: tsiProp_('TSI_PUSH_PASS'), p_rows: rows, p_dry: !!dry }),
  });
  if (resp.getResponseCode() !== 200) throw new Error('tool_spend_import said ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
  return JSON.parse(resp.getContentText());
}

/* PHOREST (not done, and why). Phorest's invoices are emailed one per account per month from invoicing@phorest.com, and they sit on the Phorest Invoice Portal
   (Manager, Business, Invoices). The mailbox that gets them is not info@ (nothing from invoicing@phorest.com has reached info@, kate@, tara@ or marish@ in 120 days), and
   no saved copy of one was at hand to write the parser from. Once those emails reach a mailbox this script runs in (a Gmail forward to info@ is enough), add a
   tsiParsePhorest_ next to tsiParseRespond_: account number to branch (the five accounts are on the Invoice Portal; keep the numbers in Supabase, not here, this repo is public), fee and SMS lines as
   kind invoiced, currency EUR with amount_aed from the ECB rate on the invoice date (or AED from Nov 2026), ext_id phorest:<invoice number>. tool_spend_import already
   accepts tool phorest. Phorest ends on 31 Jan 2027 (Phorest's own confirmation, 2 Nov 2026), so only about two more invoices are due. */
