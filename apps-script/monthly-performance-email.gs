/**
 * STANDALONE script. Monthly "your numbers + payslip" email to every stylist.
 * Built 25 Sep 2026 (Money Five pages, performance/ in this repo).
 *
 * It never sends on its own. A run makes one Gmail DRAFT per person in the
 * account that runs it: their six numbers, the one quickest way to earn more,
 * a link to their private page, and their payslip PDF attached. Kate reads the
 * drafts, then runs sendMonthlyDrafts() to send them all in one go.
 *
 * ONE-TIME SETUP (signed in as the account the emails should come from):
 *   1. script.google.com/create → paste this whole file.
 *   2. Project Settings → Script Properties, add:
 *        PERF_ADMIN_TOKEN   Kate's admin token from perf_admins (Supabase SQL:
 *                           select token from perf_admins where name = 'Kate';)
 *        PAYSLIP_FOLDER_ID  the Drive folder that holds one subfolder per month,
 *                           named YYYY-MM (e.g. 2026-09), each with one PDF per
 *                           person. The PDF's file name must contain the person's
 *                           first and last name as shown on the team page.
 *      Only the public anon key lives in this file: it can't read any perf_ table,
 *      only call the token-checked functions, same as the page itself.
 *   3. Run draftMonthlyEmails() once to approve permissions (Gmail, Drive, fetch).
 *   4. Run setupPerformanceTrigger() once: drafts are made on the 3rd of every
 *      month at 09:00 Asia/Dubai for the month just finished.
 *
 * EACH MONTH
 *   - Drop the payslip PDFs into PAYSLIP_FOLDER_ID/YYYY-MM.
 *   - The trigger makes the drafts. Kate gets a "Performance drafts ready" draft
 *     listing who has no email, who has no payslip yet, and who was skipped.
 *   - Payslips late? Add them and run draftMonthlyEmails() again: a draft that was
 *     missing its payslip is rebuilt with it, everyone else is left alone.
 *   - Happy with the drafts → run sendMonthlyDrafts().
 */

const PERF_SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const PERF_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aWp4ZW5hZm9vd2FqcWt0cXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTA1OTksImV4cCI6MjA5MTI4NjU5OX0.GL3YXupXOBGfN4FCyelbQWraUw12VJNJu-wUB3zR7Zw';
const PERF_PAGE = 'https://katealsaybar.github.io/tararosesalon-dashboard-all/performance/';
const PERF_FROM_NAME = 'Tara Rose Salon';

function perfRpc_(fn, args) {
  const r = UrlFetchApp.fetch(`${PERF_SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: PERF_ANON_KEY, Authorization: `Bearer ${PERF_ANON_KEY}` },
    payload: JSON.stringify(args),
  });
  if (r.getResponseCode() !== 200) throw new Error(`${fn} ${r.getResponseCode()}: ${r.getContentText()}`);
  return JSON.parse(r.getContentText());
}

// 'YYYY-MM' of the month before today, in Dubai time.
function previousMonth_() {
  const now = new Date(Utilities.formatDate(new Date(), 'Asia/Dubai', "yyyy-MM-dd'T'HH:mm:ss"));
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return Utilities.formatDate(d, 'Asia/Dubai', 'yyyy-MM');
}
const perfSubject_ = (month) => {
  const label = Utilities.formatDate(new Date(month + '-15T12:00:00Z'), 'Asia/Dubai', 'MMMM yyyy');
  return `Your ${label} numbers and payslip · Tara Rose`;
};

function findPayslip_(folder, name) {
  if (!folder) return null;
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const fn = f.getName().toLowerCase().replace(/[_\-.]+/g, ' ');
    if (f.getMimeType() === MimeType.PDF && words.every(w => fn.includes(w))) return f;
  }
  return null;
}

function monthFolder_(month) {
  const id = PropertiesService.getScriptProperties().getProperty('PAYSLIP_FOLDER_ID');
  if (!id) return null;
  const it = DriveApp.getFolderById(id).getFoldersByName(month);
  return it.hasNext() ? it.next() : null;
}

// Existing drafts for this month, keyed by recipient address (lower case).
function existingDrafts_(subject) {
  const out = {};
  GmailApp.getDrafts().forEach(dr => {
    const m = dr.getMessage();
    if (m.getSubject() === subject) out[m.getTo().toLowerCase()] = { draft: dr, attachments: m.getAttachments().length };
  });
  return out;
}

// ── email body ───────────────────────────────────────────────────────────
const nfmt_ = (v, f) => {
  if (v === null || v === undefined) return '–';
  if (f === 'aed') return 'AED ' + Math.round(v).toLocaleString('en-GB');
  if (f === 'pct') return (Math.round(v * 10) / 10) + '%';
  return Math.round(v).toLocaleString('en-GB');
};
function perfStatus_(v, b) {
  if (v === null || v === undefined || !b || b.target === null) return '';
  if (v >= b.target) return 'good';
  const floor = b.min !== null && b.min !== undefined ? b.min : b.target * 0.85;
  return v >= floor ? 'warn' : 'bad';
}
function perfLever_(d) {
  const n = d.numbers, b = d.benchmarks || {};
  const rp = (b.retail_pct && b.retail_pct.target) || 12, tp = (b.treatments_pct && b.treatments_pct.target) || 20;
  const o = [];
  if (n.total_revenue > 0) o.push({ aed: rp / 100 * n.total_revenue - n.retail, txt: `bringing retail up to ${rp}% of your services` });
  if (d.staff.dept === 'Hair' && n.hair_services > 0) o.push({ aed: tp / 100 * n.hair_services - n.treatments, txt: `adding treatments until they reach ${tp}% of your hair services` });
  if (n.clients > 0 && n.avg_bill) o.push({ aed: 0.05 * n.clients * n.avg_bill, txt: 'rebooking 5% more of your clients before they leave' });
  if (b.avg_bill && n.avg_bill && n.avg_bill < b.avg_bill.target) o.push({ aed: (b.avg_bill.target - n.avg_bill) * n.clients, txt: `lifting your average bill to AED ${b.avg_bill.target}` });
  const best = o.filter(x => x.aed > 50).sort((a, c) => c.aed - a.aed)[0];
  return best ? `Your quickest win next month: ${best.txt}. Last month that was worth about <b>AED ${Math.round(best.aed).toLocaleString('en-GB')}</b> more in sales.`
              : `You hit the aims for your level across the board last month. Keep going.`;
}

function perfEmailHtml_(d, token, month, hasPayslip) {
  const n = d.numbers, b = d.benchmarks || {}, isHair = d.staff.dept === 'Hair';
  const first = d.staff.name.split(' ')[0];
  const colour = { good: '#0F6E56', warn: '#BA7517', bad: '#A32D2D', '': '#5C5557' };
  const six = [
    ['Average bill', 'avg_bill', 'aed'],
    isHair ? ['Treatment %', 'treatments_pct', 'pct'] : ['Request rate', 'request_pct', 'pct'],
    ['Retail %', 'retail_pct', 'pct'],
    ['Rebooking %', 'rebooking_pct', 'pct'],
    ['Clients', 'clients', 'num'],
    ['Column fill', 'column_fill_pct', 'pct'],
  ].map(([l, k, f]) => {
    const st = perfStatus_(n[k], b[k]);
    const aim = b[k] ? `aim ${nfmt_(b[k].target, f)}` : '';
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${l}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:700;color:${colour[st]}">${nfmt_(n[k], f)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#9a8a87">${aim}</td></tr>`;
  }).join('');
  const link = `${PERF_PAGE}?t=${token}&m=${month}`;
  return `<div style="font-family:Arial,sans-serif;color:#5C5557;max-width:560px;line-height:1.5">
    <p>Hi ${first},</p>
    <p>Here are your numbers for ${Utilities.formatDate(new Date(month + '-15T12:00:00Z'), 'Asia/Dubai', 'MMMM yyyy')}${hasPayslip ? ', with your payslip attached' : ''}.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>Total revenue</b></td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:700">${nfmt_(n.total_revenue, 'aed')}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#9a8a87">${b.total_revenue ? 'aim ' + nfmt_(b.total_revenue.target, 'aed') : ''}</td></tr>
      ${six}
    </table>
    <p>${perfLever_(d)}</p>
    ${d.next_level ? `<p>Your full page also shows how far you are from ${d.next_level}.</p>` : ''}
    <p><a href="${link}" style="display:inline-block;background:#5C5557;color:#F9E8DF;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">See your full page</a></p>
    <p style="font-size:12px;color:#9a8a87">This link is yours only, please don't forward it. Revenue is ex VAT. Any questions about your numbers or payslip, talk to your salon manager.</p>
  </div>`;
}

// ── main ─────────────────────────────────────────────────────────────────
function draftMonthlyEmails(month) {
  month = (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) ? month : previousMonth_();
  const admin = PropertiesService.getScriptProperties().getProperty('PERF_ADMIN_TOKEN');
  if (!admin) throw new Error('Set PERF_ADMIN_TOKEN in Script Properties first.');
  const team = perfRpc_('perf_team', { p_admin: admin, p_month: month + '-01' });
  if (!team) throw new Error('PERF_ADMIN_TOKEN is not a valid admin token.');

  const subject = perfSubject_(month);
  const folder = monthFolder_(month);
  const existing = existingDrafts_(subject);
  const report = { drafted: [], rebuilt: [], kept: [], noEmail: [], paused: [], noPayslip: [], noData: [] };

  team.staff.forEach(s => {
    if (!s.send_email) { report.paused.push(s.name); return; }
    if (!s.email) { report.noEmail.push(s.name); return; }
    const payslip = findPayslip_(folder, s.name);
    const prior = existing[s.email.toLowerCase()];
    if (prior && (prior.attachments > 0 || !payslip)) {
      report.kept.push(s.name);
      if (!payslip) report.noPayslip.push(s.name);
      return;
    }
    const d = perfRpc_('perf_dashboard', { p_token: s.token, p_month: month + '-01' });
    if (!d || (!d.numbers.total_revenue && !d.numbers.clients)) { report.noData.push(s.name); return; }
    if (prior) { prior.draft.deleteDraft(); report.rebuilt.push(s.name); } else report.drafted.push(s.name);
    if (!payslip) report.noPayslip.push(s.name);
    GmailApp.createDraft(s.email, subject, `Your ${month} numbers: ${PERF_PAGE}?t=${s.token}&m=${month}`, {
      htmlBody: perfEmailHtml_(d, s.token, month, !!payslip),
      attachments: payslip ? [payslip.getBlob()] : [],
      name: PERF_FROM_NAME,
    });
  });

  const line = (k, v) => v.length ? `<p><b>${k} (${v.length})</b><br>${v.join(', ')}</p>` : '';
  const me = Session.getActiveUser().getEmail();
  GmailApp.createDraft(me, `Performance drafts ready · ${month}`, 'See HTML version.', {
    htmlBody: `<div style="font-family:Arial,sans-serif">
      <p>Drafts for <b>${month}</b> are in your Drafts folder under "${subject}". Nothing has been sent.</p>
      ${folder ? '' : `<p style="color:#A32D2D"><b>No payslip folder named ${month} found</b>, so every draft went without a payslip.</p>`}
      ${line('New drafts', report.drafted)}${line('Rebuilt with payslip', report.rebuilt)}${line('Already drafted, left alone', report.kept)}
      ${line('No payslip yet', report.noPayslip)}${line('No email on file', report.noEmail)}${line('Email paused', report.paused)}${line('No numbers this month', report.noData)}
      <p>When they look right, run <b>sendMonthlyDrafts()</b>. Late payslips: add them to the folder and run draftMonthlyEmails() again.</p></div>`,
  });
  Logger.log(JSON.stringify(report, null, 1));
  return report;
}

// Sends every draft with this month's subject. Run by hand after checking them.
function sendMonthlyDrafts(month) {
  month = (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) ? month : previousMonth_();
  const subject = perfSubject_(month);
  let sent = 0;
  GmailApp.getDrafts().forEach(dr => {
    if (dr.getMessage().getSubject() === subject) { dr.send(); sent++; }
  });
  Logger.log(`Sent ${sent} performance emails for ${month}.`);
  return sent;
}

function setupPerformanceTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'draftMonthlyEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('draftMonthlyEmails').timeBased()
    .onMonthDay(3).atHour(9).inTimezone('Asia/Dubai').create();
  Logger.log('Drafts will be made on the 3rd of every month at 09:00 Dubai.');
}
