/**
 * STAFF PAYSLIPS. Monthly payslip email to every stylist and beauty therapist:
 * their payslip PDF, their win and top tip for next month, and a link to their
 * own page (trk-salon-os.com/performance). Built 25 Sep 2026, rewritten 30 Sep 2026.
 *
 * Runs as payroll@tararosesalon.com (Workspace: 1,500 recipients a day), the shared
 * Accounts inbox: the triggers belong to whoever ran setupPerformanceTrigger, and
 * drafts and sends happen in that person's Gmail, so payroll@ must be the one to run
 * it. Staff see "Tara Rose Salons Accounts"; replies go to payroll@ and HR.
 *
 * THE MONTH (Kate + Jumera, 30 Sep 2026)
 *   Friday       Accounts upload the payslip PDFs: Upload Portal → Payslips tab.
 *   Saturday     09:00 draftWeekend() makes one Gmail draft per person, but only for
 *                a month whose payslips are uploaded and that hasn't been sent.
 *                Kate gets a "Payslip drafts ready" summary draft.
 *   Weekend      Kate checks the drafts. Something wrong? Run holdMonday().
 *   Monday       08:00 sendMonday() sends every draft WITH a payslip attached.
 *                Drafts without one stay in Drafts. Kate gets a note either way.
 *   After        Jumera tells the staff their payslip is in their email.
 *
 * ONE-TIME SETUP
 *   1. Paste this whole file into the project, Save.
 *   2. Run myDryRun once and approve the permissions (Gmail, fetch).
 *   3. Run setupPerformanceTrigger once. It sets the Saturday and Monday triggers.
 *
 * WHICH FUNCTION TO RUN (the dropdown next to Run)
 *   myDryRun            SAFE. Test emails to you only. Edit the DRY RUN lines first.
 *   holdMonday          Stops Monday's send. releaseMonday turns it back on.
 *   draftMonthlyEmails  Makes the REAL drafts, and Monday WILL send them. Only for
 *                       late payslips, never for testing.
 *   sendMonthlyDrafts   Sends every draft of the month now, payslip or not. By hand only.
 *
 * Keep this file private: ADMIN_TOKEN can read the whole team's numbers. The copy
 * in git has it blank.
 */

// ── SETTINGS ─────────────────────────────────────────────────────────────
const ADMIN_TOKEN = '';               // Kate's perf_admins token (or Script Property PERF_ADMIN_TOKEN)
const PERF_FROM_NAME = 'Tara Rose Salons Accounts';
const PERF_REPLY_TO = 'payroll@tararosesalon.com, hr.tararose@gmail.com';   // Accounts + HR answer payslip questions; ONE string, commas inside the quotes

// ── DRY RUN: edit these three lines, Save, pick myDryRun and press Run ───
const DRY_RUN_MONTH = '2026-09';
const DRY_RUN_STAFF = ['Ibrahim'];   // first names or full names, as many as you like
const DRY_RUN_TO = '';               // '' = your own inbox; or 'a@x.com, b@y.com'

function myDryRun() { dryRunToMe(DRY_RUN_MONTH, DRY_RUN_STAFF, DRY_RUN_TO); }

// ── from here down, nothing to edit ──────────────────────────────────────
const PERF_SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
// Public anon key: it can't read any perf_ table or the payslips bucket, only call
// the token-checked functions, same as the page itself.
const PERF_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aWp4ZW5hZm9vd2FqcWt0cXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTA1OTksImV4cCI6MjA5MTI4NjU5OX0.GL3YXupXOBGfN4FCyelbQWraUw12VJNJu-wUB3zR7Zw';
const PERF_PAGE = 'https://trk-salon-os.com/performance/';
const PERF_LOGO = 'https://trk-salon-os.com/assets/email-logo.png';

function perfAdmin_() {
  const t = PropertiesService.getScriptProperties().getProperty('PERF_ADMIN_TOKEN') || ADMIN_TOKEN;
  if (!t) throw new Error('No admin token: fill in ADMIN_TOKEN at the top of the file.');
  return t;
}
const perfMonth_ = (month) => (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) ? month : previousMonth_();

function perfRpc_(fn, args) {
  const r = UrlFetchApp.fetch(`${PERF_SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: PERF_ANON_KEY, Authorization: `Bearer ${PERF_ANON_KEY}` },
    payload: JSON.stringify(args),
  });
  if (r.getResponseCode() !== 200) throw new Error(`${fn} ${r.getResponseCode()}: ${r.getContentText()}`);
  return JSON.parse(r.getContentText());
}
function perfTeam_(month) {
  const team = perfRpc_('perf_team', { p_admin: perfAdmin_(), p_month: month + '-01' });
  if (!team) throw new Error('ADMIN_TOKEN is not a valid admin token.');
  return team;
}
function perfPayslipsFn_(payload) {
  const r = UrlFetchApp.fetch(`${PERF_SUPA_URL}/functions/v1/payslips`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: PERF_ANON_KEY, Authorization: `Bearer ${PERF_ANON_KEY}` },
    payload: JSON.stringify(payload),
  });
  if (r.getResponseCode() !== 200) throw new Error(`payslips ${payload.action} ${r.getResponseCode()}: ${r.getContentText()}`);
  return JSON.parse(r.getContentText());
}

// 'YYYY-MM' of the month before today, in Dubai time.
function previousMonth_() {
  const now = new Date(Utilities.formatDate(new Date(), 'Asia/Dubai', "yyyy-MM-dd'T'HH:mm:ss"));
  return Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'Asia/Dubai', 'yyyy-MM');
}
// The months the triggers look at: last month and this one, in Dubai time, so a
// payslip run at the end of a month or the start of the next both count.
function perfCandidateMonths_() {
  const now = new Date(Utilities.formatDate(new Date(), 'Asia/Dubai', "yyyy-MM-dd'T'HH:mm:ss"));
  return [previousMonth_(), Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), 'Asia/Dubai', 'yyyy-MM')];
}
const perfLabel_ = (month, fmt) => Utilities.formatDate(new Date(month + '-15T12:00:00Z'), 'Asia/Dubai', fmt);
const perfSubject_ = (month) => `Your ${perfLabel_(month, 'MMMM yyyy')} payslip · Tara Rose`;

// Their payslip PDF for the month, from the Upload Portal's Payslips tab. The edge
// function checks the person's own token and returns a ten-minute signed link;
// null when nothing has been uploaded yet.
function fetchPayslip_(token, month, name) {
  const p = perfPayslipsFn_({ action: 'mine', token, month });
  if (!p.exists) return null;
  const pdf = UrlFetchApp.fetch(p.url, { muteHttpExceptions: true });
  if (pdf.getResponseCode() !== 200) throw new Error(`payslip download ${pdf.getResponseCode()} for ${name}`);
  return pdf.getBlob().setName(`${name} payslip ${month}.pdf`).setContentType('application/pdf');
}
function perfPayslipCount_(month) {
  return perfPayslipsFn_({ action: 'list', admin: perfAdmin_(), month }).staff.filter(s => s.payslip).length;
}

// Drafts with this subject, keyed by recipient address (lower case).
function existingDrafts_(subject) {
  const out = {};
  GmailApp.getDrafts().forEach(dr => {
    const m = dr.getMessage();
    if (m.getSubject() === subject) out[m.getTo().toLowerCase()] = { draft: dr, attachments: m.getAttachments().length };
  });
  return out;
}

// ── email body ───────────────────────────────────────────────────────────
// Win + top tip (Tara, 30 Sep 2026: "always start with the win, then a top tip to
// close the gap"). An AI-written pair saved for the month (perf_tips) wins; otherwise
// the formula in performance/win-gap.js, fetched from the live site and run here, so
// the email and the page always say the same thing.
function perfWinGapFn_() {
  if (!perfWinGapFn_.fn) {
    const src = UrlFetchApp.fetch(PERF_PAGE + 'win-gap.js?' + Date.now()).getContentText();
    const root = {};
    new Function('window', src)(root);
    perfWinGapFn_.fn = root.winGap;
  }
  return perfWinGapFn_.fn;
}
function perfWinTip_(d, token, month) {
  let ai = null;
  try { ai = perfRpc_('perf_tip', { p_token: token, p_month: month + '-01' }); } catch (e) {}
  if (ai && ai.win && ai.tip) return ai;
  try { return perfWinGapFn_()(d); } catch (e) { return null; }
}
const escH_ = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function perfWinTipHtml_(wt) {
  if (!wt) return '';
  return (wt.win ? `<p style="margin:14px 0 8px;padding:10px 14px;background:#E1F5EE;border-radius:8px"><b style="color:#0F6E56">Your win</b><br>${escH_(wt.win)}</p>` : '')
    + (wt.tip ? `<p style="margin:8px 0 14px;padding:10px 14px;background:#FAEEDA;border-radius:8px"><b style="color:#BA7517">Top tip for next month</b><br>${escH_(wt.tip)}${wt.how ? `<br><span style="color:#77706A">${escH_(wt.how)}</span>` : ''}</p>` : '');
}

// Short on purpose (Kate, 30 Sep 2026): payslip, win, tip and the link. The six
// numbers live on their page, where they come with their aims and context.
function perfEmailHtml_(d, token, month, hasPayslip) {
  const first = d.staff.name.split(' ')[0];
  const label = perfLabel_(month, 'MMMM');
  const link = `${PERF_PAGE}?t=${token}&m=${month}`;
  return `<div style="font-family:Arial,sans-serif;color:#5C5557;max-width:560px;line-height:1.5">
    <p>Hi ${escH_(first)},</p>
    <p>${hasPayslip ? `Your ${label} payslip is attached.` : `Here is your ${label} in short. Your payslip will follow.`}</p>
    ${perfWinTipHtml_(perfWinTip_(d, token, month))}
    <p>Your full month is on your own page: your six numbers, your reviews${d.next_level ? `, and how close you are to ${escH_(d.next_level)}` : ''}.</p>
    <p><a href="${link}" style="display:inline-block;background:#5C5557;color:#F9E8DF;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">See my month</a></p>
    <p>Questions about your payslip? Just reply to this email. Questions about your numbers? Your salon manager can walk you through them.</p>
    <p style="font-size:12px;color:#9a8a87">This link is yours only, so please keep it to yourself.</p>
    <p style="margin-top:22px"><img src="${PERF_LOGO}" alt="Tara Rose Salons" width="160" style="display:block;width:160px;height:auto;border:0"></p>
  </div>`;
}
const perfMailOpts_ = (html, payslip) => ({
  htmlBody: html, attachments: payslip ? [payslip] : [], name: PERF_FROM_NAME, replyTo: PERF_REPLY_TO,
});

// ── dry run ──────────────────────────────────────────────────────────────
// The real email for the people named (or the first three, payslips first), sent
// ONLY to `to` (default: the account running this). "[TEST]" subject, so
// sendMonday() never touches it, and no draft or setting is written.
function dryRunToMe(month, who, to) {
  month = perfMonth_(month);
  const team = perfTeam_(month);
  const me = to || Session.getActiveUser().getEmail();
  const norm = v => String(v).toLowerCase().trim();
  const hit = (s, n) => norm(s.name) === n || norm(s.name).split(' ')[0] === n;
  const names = Array.isArray(who) ? who.map(norm).filter(Boolean) : [];
  let pool = team.staff.filter(s => s.send_email && s.email);
  if (names.length) {
    pool = pool.filter(s => names.some(n => hit(s, n)));
    const missing = names.filter(n => !pool.some(s => hit(s, n)));
    if (missing.length) Logger.log('Not found on the email list: ' + missing.join(', '));
  }
  const withSlip = [], without = [];
  pool.forEach(s => {
    const payslip = fetchPayslip_(s.token, month, s.name);
    (payslip ? withSlip : without).push({ s, payslip });
  });
  const picks = withSlip.concat(without).slice(0, names.length ? undefined : 3);
  let sent = 0;
  picks.forEach(({ s, payslip }) => {
    const d = perfRpc_('perf_dashboard', { p_token: s.token, p_month: month + '-01' });
    if (!d) { Logger.log(`No numbers for ${s.name} in ${month}, skipped.`); return; }
    const note = `<p style="font-family:Arial,sans-serif;padding:8px 12px;background:#eee;border-radius:6px">Dry run. The real one goes to <b>${escH_(s.name)}</b> &lt;${escH_(s.email)}&gt;${payslip ? '' : ', and has no payslip uploaded yet'}.</p>`;
    GmailApp.sendEmail(me, '[TEST] ' + perfSubject_(month), 'See HTML version.', perfMailOpts_(note + perfEmailHtml_(d, s.token, month, !!payslip), payslip));
    sent++;
  });
  Logger.log(`Sent ${sent} test emails to ${me} for ${month}. ${withSlip.length} of those picked have a payslip.`);
}

// ── the real drafts ──────────────────────────────────────────────────────
// One draft per person. A rerun rebuilds only the drafts that were missing their
// payslip and now have one; everyone else is left alone.
function draftMonthlyEmails(month) {
  month = perfMonth_(month);
  const team = perfTeam_(month);
  const subject = perfSubject_(month);
  const existing = existingDrafts_(subject);
  const report = { drafted: [], rebuilt: [], kept: [], noEmail: [], paused: [], noPayslip: [], noData: [] };

  team.staff.forEach(s => {
    if (!s.send_email) { report.paused.push(s.name); return; }
    if (!s.email) { report.noEmail.push(s.name); return; }
    const payslip = fetchPayslip_(s.token, month, s.name);
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
    GmailApp.createDraft(s.email, subject, `Your ${perfLabel_(month, 'MMMM')} payslip: ${PERF_PAGE}?t=${s.token}&m=${month}`,
      perfMailOpts_(perfEmailHtml_(d, s.token, month, !!payslip), payslip));
  });

  // One summary per month: a rerun replaces the last one instead of piling up.
  const line = (k, v) => v.length ? `<p><b>${k} (${v.length})</b><br>${v.map(escH_).join(', ')}</p>` : '';
  const me = Session.getActiveUser().getEmail();
  const reportSubject = `Payslip drafts ready · ${month}`;
  GmailApp.getDrafts().forEach(dr => { if (dr.getMessage().getSubject() === reportSubject) dr.deleteDraft(); });
  GmailApp.createDraft(me, reportSubject, 'See HTML version.', {
    htmlBody: `<div style="font-family:Arial,sans-serif">
      <p>Drafts for <b>${month}</b> are in your Drafts folder under "${subject}". Nothing has been sent.</p>
      ${line('New drafts', report.drafted)}${line('Rebuilt with payslip', report.rebuilt)}${line('Already drafted, left alone', report.kept)}
      ${line('No payslip yet', report.noPayslip)}${line('No email on file', report.noEmail)}${line('Email paused', report.paused)}${line('No numbers this month', report.noData)}
      <p>Every draft with a payslip attached goes out on <b>Monday at 08:00</b>. To stop that, run <b>holdMonday</b>. Late payslips: upload them in the Upload Portal → Payslips tab and run draftMonthlyEmails again.</p></div>`,
  });
  PropertiesService.getScriptProperties().setProperty('PERF_DRAFTED_' + month, new Date().toISOString());
  Logger.log(JSON.stringify(report, null, 1));
  return report;
}

// Sends every draft of the month now, with or without a payslip. By hand only.
function sendMonthlyDrafts(month) {
  month = perfMonth_(month);
  const subject = perfSubject_(month);
  let sent = 0;
  GmailApp.getDrafts().forEach(dr => { if (dr.getMessage().getSubject() === subject) { dr.send(); sent++; } });
  if (sent) PropertiesService.getScriptProperties().setProperty('PERF_SENT_' + month, new Date().toISOString());
  Logger.log(`Sent ${sent} payslip emails for ${month}.`);
  return sent;
}

// ── triggers ─────────────────────────────────────────────────────────────
// Saturday 09:00. Drafts any month whose payslips are uploaded and that hasn't been
// sent. No payslips = nothing happens, so it runs weekly but acts once a month.
function draftWeekend() {
  const props = PropertiesService.getScriptProperties();
  perfCandidateMonths_().forEach(month => {
    if (props.getProperty('PERF_SENT_' + month)) return;
    const n = perfPayslipCount_(month);
    Logger.log(`${month}: ${n} payslips uploaded.`);
    if (n) draftMonthlyEmails(month);
  });
}

// Monday 08:00. Sends the drafts that carry a payslip, for any month drafted and not
// yet sent. Drafts without a payslip stay put. Kate gets a note either way.
function sendMonday() {
  const props = PropertiesService.getScriptProperties();
  const me = Session.getActiveUser().getEmail();
  perfCandidateMonths_().forEach(month => {
    if (!props.getProperty('PERF_DRAFTED_' + month) || props.getProperty('PERF_SENT_' + month)) return;
    if (props.getProperty('PERF_HOLD')) {
      GmailApp.sendEmail(me, `Payslip emails held · ${month}`,
        `Nothing was sent for ${month}: holdMonday is on. Run releaseMonday and then sendMonday to send now, or leave it for next Monday.`);
      return;
    }
    const subject = perfSubject_(month);
    const sent = [], left = [];
    GmailApp.getDrafts().forEach(dr => {
      const m = dr.getMessage();
      if (m.getSubject() !== subject) return;
      if (m.getAttachments().length) { dr.send(); sent.push(m.getTo()); } else left.push(m.getTo());
    });
    if (sent.length) props.setProperty('PERF_SENT_' + month, new Date().toISOString());
    GmailApp.sendEmail(me, `Payslip emails sent · ${month}`,
      `Sent ${sent.length} emails with payslips for ${month}.\n\n`
      + (left.length ? `Still in Drafts, no payslip attached (${left.length}):\n${left.join('\n')}\n\nUpload their payslips, run draftMonthlyEmails and send those drafts by hand.` : 'Nothing left in Drafts.'));
    Logger.log(`Sent ${sent.length}, left ${left.length} for ${month}.`);
  });
}

function holdMonday() { PropertiesService.getScriptProperties().setProperty('PERF_HOLD', new Date().toISOString()); Logger.log('Monday send is on hold. Run releaseMonday to turn it back on.'); }
function releaseMonday() { PropertiesService.getScriptProperties().deleteProperty('PERF_HOLD'); Logger.log('Monday send is back on.'); }

function setupPerformanceTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['draftMonthlyEmails', 'draftWeekend', 'sendMonday'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('draftWeekend').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(9).inTimezone('Asia/Dubai').create();
  // Google runs an hourly trigger at a random minute in that hour; nearMinute pulls it
  // to about 08:00 (give or take 15 minutes) where Google allows it on a weekly one.
  const monday = () => ScriptApp.newTrigger('sendMonday').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone('Asia/Dubai');
  try { monday().nearMinute(0).create(); }
  catch (e) { monday().create(); Logger.log('Monday send runs some time between 08:00 and 09:00.'); }
  Logger.log('Drafts on Saturday 09:00, send on Monday 08:00, Dubai.');
}
