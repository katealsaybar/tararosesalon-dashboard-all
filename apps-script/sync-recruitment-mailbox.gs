/**
 * STANDALONE script, one copy in EACH mailbox: recruitment@tararosesalon.com and info@tararosesalon.com (Kate, 9 Nov 2026). Do NOT paste it into a branch spreadsheet.
 * Every 5 minutes it reads that mailbox with GmailApp (it runs AS the account, so there is no Gmail token to store or renew and no 7 day expiry) and pushes what it
 * finds to recruit_applicants on the dashboard Supabase through recruit_import() (migrations/recruitment.sql), which the Recruitment page reads. READ ONLY: it never
 * sends, labels, archives, moves or deletes an email.
 *
 * ONE-TIME SETUP (do this once in each mailbox, signed in as that account):
 *   1. script.google.com/create, paste this whole file, Project Settings, tick "Show appsscript.json" and set oauthScopes to
 *        ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/script.external_request", "https://www.googleapis.com/auth/script.scriptapp"]
 *      (timeZone Asia/Dubai, runtimeVersion V8). gmail.readonly is the narrowest Gmail scope: the script cannot change mail even by mistake.
 *   2. Project Settings, Script Properties, add:
 *        RCT_MAILBOX   = recruitment   (or  info  in the info@ copy)
 *        RCT_ANON_KEY  = the dashboard's publishable (anon) key, the same one the site uses
 *        RCT_PUSH_PASS = the push pass the other pushers use (public.push_passes, active)
 *      Nothing secret lives in this file.
 *   3. Run dryRun() once and approve the permissions. The log shows what it WOULD send (counts only, nothing is written).
 *   4. Backfill history in slices so no run hits Apps Script's 6 minute limit: set Script Properties BACKFILL_FROM and BACKFILL_TO (for example 2026/07/01 and
 *      2026/08/01), run backfillOnce(), read the log, then the next month. recruitment@ starts 17 Jul 2026; info@ from 1 Jul 2026.
 *   5. Run setupTrigger() once: installs the every 5 minutes run. syncRecruitment() keeps a 2 day overlap and the import is idempotent, so a missed run catches up.
 *
 * WHAT IT SENDS, one row per thing it sees (kind): application (website form, or a direct email from someone looking for work), reply (they answered the
 * automatic "We've received your application" email), human_reply (we wrote to them; the automatic brochure email does not count), bounce (our email to them
 * came back). A reply, human_reply or bounce from someone who never applied is ignored by the database. Stage is never touched here.
 */

const RCT_SUPA = 'https://gvijxenafoowajqktqvd.supabase.co';
const RCT_OWN_DOMAIN = '@tararosesalon.com';
const RCT_OVERLAP_MS = 2 * 86400000;
const RCT_BUDGET_MS = 4.5 * 60 * 1000;
const RCT_UNREADABLE_CAP = 20;

function rctProp_(k, optional) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v && !optional) throw new Error('Script Properties is missing ' + k + ', see the header comment.');
  return v || '';
}
function rctMailbox_() { return rctProp_('RCT_MAILBOX') === 'info' ? 'info' : 'recruitment'; }
function rctOwnAddr_() { return rctMailbox_() + RCT_OWN_DOMAIN; }

/* ---------- entry points ---------- */
function syncRecruitment() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.log('Another run is still going, skipping.'); return; }
  try {
    const props = PropertiesService.getScriptProperties();
    const last = Number(props.getProperty('RCT_LAST') || 0);
    const from = last ? last - RCT_OVERLAP_MS : Date.now() - 7 * 86400000;
    const started = Date.now();
    rctRun_(from, null, false);
    props.setProperty('RCT_LAST', String(started));
  } finally { lock.releaseLock(); }
}
function dryRun() { rctRun_(Date.now() - 14 * 86400000, null, true); }
function backfillOnce() {
  const f = rctProp_('BACKFILL_FROM'), t = rctProp_('BACKFILL_TO', true);
  rctRun_(new Date(f.replace(/\//g, '-') + 'T00:00:00+04:00').getTime(), t ? new Date(t.replace(/\//g, '-') + 'T00:00:00+04:00').getTime() : null, false);
}
// One click, no Script Properties to edit (added 11 Nov 2026): read the WHOLE mailbox from the day it was opened (recruitment@ was opened on 25 Jun 2026; info@ has mail from 2025,
// so in info@ use backfillOnce with BACKFILL_FROM instead). Same import as backfillOnce: idempotent, nothing is sent or changed in Gmail. If it says "Out of time", run
// backfillFirstHalf() and then backfillSecondHalf().
function backfillFromStart() { rctRun_(new Date('2026-06-25T00:00:00+04:00').getTime(), null, false); }
function backfillFirstHalf() { rctRun_(new Date('2026-06-25T00:00:00+04:00').getTime(), new Date('2026-09-01T00:00:00+04:00').getTime(), false); }
function backfillSecondHalf() { rctRun_(new Date('2026-09-01T00:00:00+04:00').getTime(), null, false); }
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncRecruitment') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncRecruitment').timeBased().everyMinutes(5).create();
  console.log('Installed: syncRecruitment every 5 minutes.');
}

/* ---------- reading the mailbox ---------- */
const RCT_JOB = /applica|apply|applying|vacanc|position|\bjob|career|\bcv\b|resume|curriculum|hiring|recruit|employ|stylist|hairdress|barber|beautician|therapist|technician|receptionist|braider|manicur|lash|demande d.emploi|looking for (a )?(work|job)|work visa|relocat|opportunit/i;
const RCT_VENDOR = /partnership|collaboration|introduc|e-?invoic|pilot|demo\b|whatsapp receptionist|ai voice|supplier|distribut|quote|proposal|webinar|newsletter|unsubscribe|short-form content|pitch|seo\b|leasing|\bugc\b|talent|actress|reel\b|booking app|\bads\b/i;
const RCT_SYSTEM = /mailer-daemon|postmaster|noreply|no-reply|donotreply|mohre\.gov|canva\.com|google\.com|brevosend|notification/i;
const RCT_PERSONAL = /@(gmail|googlemail|icloud|me|yahoo|hotmail|outlook|live|yandex|mail|proton|protonmail|aol)\./i;

function rctQueries_(fromMs, toMs) {
  const a = ' after:' + Math.floor(fromMs / 1000) + (toMs ? ' before:' + Math.floor(toMs / 1000) : '');
  if (rctMailbox_() === 'recruitment') return ['(in:inbox OR in:sent)' + a];   // the whole recruitment mailbox is recruitment
  const quiet = ' -category:promotions -category:updates -category:social -category:forums';
  // info@ also gets suppliers, MOHRE and receipts, so only ask Gmail for mail that looks like a job enquiry; a message with no subject and no
  // attachment is not picked up (a known gap, they are rare).
  return [
    'in:inbox' + quiet + a + ' subject:(application OR apply OR applying OR vacancy OR position OR job OR career OR cv OR resume OR hiring OR stylist OR hairdresser OR hairdressing OR barber OR beautician OR therapist OR technician OR receptionist OR braider OR enquiry OR opportunity OR "looking for")',
    'in:inbox' + quiet + a + ' has:attachment (filename:pdf OR filename:doc OR filename:docx)',
    'in:sent' + a,                                          // our own replies (human_reply)
  ];
}

/* A message Gmail will not let a script read (for example a confidential-mode email: "Exception: Gmail operation not allowed.") is skipped and counted as
   unreadable, so one such message cannot stop the whole run (added 9 Nov 2026 after the info@ backfill crashed on one). Only this kind of read failure is
   skipped: a quota error, an out-of-time error, a push error or a bug still stops the run. */
function rctReadFailure_(e) { return /Gmail operation not allowed|not allowed to (read|access)|No message with id/i.test(String((e && e.message) || e)); }
function rctSafe_(fn, fallback) { try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (e) { return fallback; } }
// date, sender address and subject only (no body), each read on its own because these calls may throw on the same message
function rctNoteUnreadable_(m, th, un) {
  un.count++;
  if (un.list.length >= RCT_UNREADABLE_CAP) return;
  const d = rctSafe_(function () { return m.getDate().getTime(); }, 0);
  const addr = rctSafe_(function () { return rctAddr_(m.getFrom()); }, '');
  const subj = rctSafe_(function () { return String(m.getSubject() || ''); }, rctSafe_(function () { return String(th.getFirstMessageSubject() || ''); }, ''));
  un.list.push((d ? new Date(d + 4 * 3600000).toISOString().slice(0, 16).replace('T', ' ') + ' Dubai' : 'date not readable') + ' | ' + (addr || 'sender not readable') + ' | ' + (subj.replace(/\s+/g, ' ').trim().slice(0, 80) || 'subject not readable'));
}

function rctRun_(fromMs, toMs, dry) {
  const t0 = Date.now(), seen = {}, rows = [], own = rctOwnAddr_(), un = { count: 0, list: [] }, cvJobs = [];
  rctQueries_(fromMs, toMs).forEach(function (q) {
    for (let start = 0; start < 1500; start += 100) {
      if (Date.now() - t0 > RCT_BUDGET_MS) throw new Error('Out of time, run again for a smaller window (BACKFILL_FROM / BACKFILL_TO).');
      const threads = GmailApp.search(q, start, 100);
      threads.forEach(function (th) {
        let msgs;
        try { msgs = th.getMessages(); } catch (e) { if (!rctReadFailure_(e)) throw e; rctNoteUnreadable_(th, th, un); return; }
        msgs.forEach(function (m) {
          try {
            const id = m.getId(); if (seen[id]) return;
            const d = m.getDate().getTime(); if (d < fromMs || (toMs && d >= toMs)) return;
            seen[id] = 1;
            const r = rctClassify_(m, own);
            if (r) { rows.push(r); if (r.kind === 'application' && r.source === 'email') cvJobs.push({ id: id, m: m }); }   // a direct email: its CV is an attached file
          } catch (e) {
            if (!rctReadFailure_(e)) throw e;
            rctNoteUnreadable_(m, th, un);
          }
        });
      });
      if (threads.length < 100) break;
    }
  });
  // an application with no email, no WhatsApp and no name cannot be told apart from anyone else, so the database skips it: count them so a parsing gap shows in the log
  const totals = { dry: dry, sent: rows.length, blank_applications: rows.filter(function (r) { return r.kind === 'application' && !r.email && !r.whatsapp && !r.name; }).length, kinds: {}, unreadable: un.count };
  rows.forEach(function (r) { totals.kinds[r.kind + (r.source ? '/' + r.source : '')] = (totals.kinds[r.kind + (r.source ? '/' + r.source : '')] || 0) + 1; });
  for (let i = 0; i < rows.length; i += 200) {
    const res = rctPush_(rows.slice(i, i + 200), dry);
    Object.keys(res).forEach(function (k) { if (typeof res[k] === 'number') totals[k] = (totals[k] || 0) + res[k]; });
  }
  totals.cv_rebuilt = RCT_CV_STATS.rebuilt; totals.cv_unresolved = RCT_CV_STATS.unresolved;
  if (RCT_CV_DIAG.length) console.log('CV links not rebuilt, first ' + RCT_CV_DIAG.length + ':\n' + RCT_CV_DIAG.join('\n'));
  if (!dry) totals.cv_files = rctUploadCvs_(cvJobs, t0); else totals.cv_files = { direct_emails: cvJobs.length, dry: true };
  console.log(JSON.stringify(totals));
  if (un.count) console.log('Unreadable by Apps Script (open these in Gmail by hand; date | sender | subject; first ' + Math.min(un.count, RCT_UNREADABLE_CAP) + ' of ' + un.count + '):\n' + un.list.join('\n'));
  return totals;
}

function rctPush_(rows, dry) {
  const key = rctProp_('RCT_ANON_KEY');
  const resp = UrlFetchApp.fetch(RCT_SUPA + '/rest/v1/rpc/recruit_import', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify({ p_pass: rctProp_('RCT_PUSH_PASS'), p_rows: rows, p_dry: !!dry }),
  });
  if (resp.getResponseCode() !== 200) throw new Error('recruit_import said ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300));
  return JSON.parse(resp.getContentText());
}

/* ---------- the CV attached to a direct email (added 11 Nov 2026) ----------
   A direct email carries its CV as an attached file, and Coach Emma has no access to info@, so each attachment is sent to the edge function recruit-cv-upload (same push
   pass), which keeps it in the private bucket recruit-cvs; Kate and Coach Emma open it from the Recruitment page. One call first asks which messages already have their file, so
   the every-5-minutes run and a backfill never upload the same file twice. Only the best attachment of a message is sent: a file named like a CV, else a pdf / doc / docx, else the
   largest picture of 40 KB or more (a signature logo is smaller). 5 MB a file. A failure is counted and logged, never stops the run. */
const RCT_CV_EXT = { pdf: 1, doc: 1, docx: 1, jpg: 1, jpeg: 1, png: 1, webp: 1 };
const RCT_CV_MAX = 5 * 1024 * 1024;
// 11 Nov 2026: includeInlineImages is TRUE on purpose. The info@ backfill saw 44 of 45 direct emails with no attachment although some say 'CV attached' (Akash Deep, Merin R):
// phone and some desktop mail apps send a PDF with an inline disposition, which a call that leaves inline parts out does not return. The filters below (CV-type files only,
// pictures of 40 KB or more) already keep signature logos out.
function rctPickCv_(m) {
  let atts; try { atts = m.getAttachments({ includeInlineImages: true, includeAttachments: true }); } catch (e) { return null; }
  let best = null, bestScore = 0;
  atts.forEach(function (a) {
    const name = String(a.getName() || ''), ext = (name.split('.').pop() || '').toLowerCase(), size = a.getSize();
    if (!RCT_CV_EXT[ext] || size <= 0 || size > RCT_CV_MAX) return;
    const doc = ext === 'pdf' || ext === 'doc' || ext === 'docx';
    if (!doc && size < 40 * 1024) return;
    const score = (/\bcv\b|resume|r\u00e9sum\u00e9|curriculum/i.test(name) ? 4 : 0) + (doc ? 2 : 1) + size / 1e9;
    if (score > bestScore) { best = a; bestScore = score; }
  });
  return best;
}
function rctAttInfo_(m) {
  try { return m.getAttachments({ includeInlineImages: true, includeAttachments: true }).map(function (a) { return a.getName() + ' ' + Math.round(a.getSize() / 1024) + 'KB'; }).join('; '); } catch (e) { return 'unreadable: ' + e; }
}
function rctUploadCvs_(jobs, t0) {
  const res = { direct_emails: jobs.length, uploaded: 0, already: 0, no_attachment: 0, refused: 0, failed: 0, left_for_next_run: 0 }, errs = [], refused = [];
  if (!jobs.length) return res;
  const key = rctProp_('RCT_ANON_KEY'), pass = rctProp_('RCT_PUSH_PASS'), url = RCT_SUPA + '/functions/v1/recruit-cv-upload';
  const stored = {};
  for (let i = 0; i < jobs.length; i += 200) {
    const ids = jobs.slice(i, i + 200).map(function (j) { return j.id; });
    const r = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, contentType: 'application/json', headers: { apikey: key, 'x-push-pass': pass, 'x-mode': 'check' }, payload: JSON.stringify({ msg_ids: ids }) });
    if (r.getResponseCode() !== 200) throw new Error('recruit-cv-upload (check) said ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
    (JSON.parse(r.getContentText()).stored || []).forEach(function (x) { stored[x] = 1; });
  }
  for (let k = 0; k < jobs.length; k++) {
    const j = jobs[k];
    if (stored[j.id]) { res.already++; continue; }
    if (Date.now() - t0 > RCT_BUDGET_MS) { res.left_for_next_run = jobs.length - k; break; }
    const a = rctPickCv_(j.m);
    if (!a) {
      res.no_attachment++;
      // say WHY nothing was kept: no attachment at all, or files that were refused (type or size), so the next change is based on facts
      const seen = rctAttInfo_(j.m);
      if (seen) { res.refused++; if (refused.length < 12) refused.push(j.id + ' | ' + seen); }
      continue;
    }
    try {
      const r = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, contentType: 'application/octet-stream',
        headers: { apikey: key, 'x-push-pass': pass, 'x-msg-id': j.id, 'x-file-name': encodeURIComponent(a.getName()) }, payload: a.copyBlob().getBytes() });
      if (r.getResponseCode() === 200) res.uploaded++;
      else { res.failed++; if (errs.length < 5) errs.push(j.id + ' ' + a.getName() + ': ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 120)); }
    } catch (e) { res.failed++; if (errs.length < 5) errs.push(j.id + ': ' + e); }
  }
  if (errs.length) console.log('CV uploads that failed (first 5):\n' + errs.join('\n'));
  if (refused.length) console.log('Attachments that were NOT kept, first ' + refused.length + ' (message id | file names and sizes):\n' + refused.join('\n'));
  return res;
}

/* ---------- classifying one message ---------- */
function rctAddr_(s) { const m = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(String(s || '')); return m ? m[0].toLowerCase() : ''; }
function rctNameOf_(from) {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(String(from || ''));
  const n = m ? m[1].trim() : '';
  return n && !/@/.test(n) ? n : '';
}

function rctClassify_(m, own) {
  const from = m.getFrom(), fromAddr = rctAddr_(from), subject = String(m.getSubject() || '');
  const at = m.getDate().toISOString(), mailbox = rctMailbox_(), msgId = m.getId();
  const body = String(m.getPlainBody() || '');

  // 1. the website form: raw copy (from info@) and the structured copy (from recruitment@ to itself)
  if (/^New application:/i.test(subject) && fromAddr.indexOf('recruitment@') === 0) return rctStructured_(body, at, mailbox, msgId);
  if (/^Recruitment Form submission/i.test(subject)) return rctRawForm_(body, at, mailbox, msgId, function () { return m.getBody(); });

  // 2. bounces: the failed address is the one in the body that is not ours
  if (/mailer-daemon|postmaster/i.test(fromAddr)) {
    const all = body.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    const bad = all.map(function (x) { return x.toLowerCase(); }).filter(function (x) { return x.indexOf(RCT_OWN_DOMAIN) < 0 && !/mailer-daemon|postmaster|google|googlemail/.test(x); })[0];
    return bad ? { kind: 'bounce', email: bad, at: at, mailbox: mailbox, msg_id: msgId } : null;
  }

  // 3. something we sent: a human reply, unless it is the automatic brochure email or a note to ourselves
  if (fromAddr === own || (fromAddr.indexOf(RCT_OWN_DOMAIN) > 0 && String(m.getTo()).toLowerCase().indexOf(RCT_OWN_DOMAIN) < 0)) {
    if (/^(we.ve received your application|new application:)/i.test(subject)) return null;
    const to = rctAddr_(m.getTo());
    if (!to || to.indexOf(RCT_OWN_DOMAIN) > 0) return null;
    return { kind: 'human_reply', email: to, at: at, mailbox: mailbox, msg_id: msgId };
  }

  // 4. someone answering the automatic email
  if (/^(re|fw|fwd):\s*we.ve received your application/i.test(subject) && fromAddr) return { kind: 'reply', email: fromAddr, at: at, mailbox: mailbox, msg_id: msgId };

  // 5. a direct email from someone looking for work
  if (!fromAddr || RCT_SYSTEM.test(fromAddr) || fromAddr.indexOf(RCT_OWN_DOMAIN) > 0) return null;
  const to = (String(m.getTo()) + ' ' + String(m.getCc())).toLowerCase();
  if (to.indexOf('recruitment@') < 0 && to.indexOf('info@') < 0) return null;       // sent through some other company's address
  const head = subject + ' ' + body.slice(0, 600);
  const personal = RCT_PERSONAL.test(fromAddr);
  if (!personal) return null;
  if (RCT_VENDOR.test(subject) && !RCT_JOB.test(body.slice(0, 400))) return null;
  // a short or blank message with a CV attached has no job words; a long message with none is not a job enquiry
  if (!RCT_JOB.test(head) && body.trim().length > 200) return null;
  return rctDirect_(m, fromAddr, subject, body, at, mailbox, msgId);
}

/* ---------- the CV link (fixed 11 Nov 2026) ----------
   The raw form copy (from info@) is an HTML email, and GmailApp's plain body wraps the CV filename in a Brevo click-tracking link (badhbgjd.r.*.sendibt*.com or
   tsp1-brevo.net, /tr/cl/...). Those links are dead (404) and hide the real file, so 249 applicants showed a CV that opened "Page not found". The real file sits at
   the website's fixed Gravity Forms folder: BASE + YYYY/MM + / + the file name shown in the email (checked: IMG_8698.jpg, 10 Sep 2026, answers 200). The month is the
   upload month, so a few days either side of midnight can land in the neighbouring month: try each candidate and keep the first one the website answers 200 for.
   If none answers, the link is left blank (the database then keeps whatever it already has) and the run logs how many it could not resolve. */
const RCT_CV_BASE = 'https://www.tararosesalon.com/wp-content/uploads/gravity_forms/14-751f9867c40e14976fe72c223c1edc15/';
const RCT_TRACKING = /^https?:\/\/[^\/]*(sendibt\d*|brevo)[^\/]*\//i;
var RCT_CV_STATS = { rebuilt: 0, unresolved: 0 };
function rctIsTracking_(u) { return RCT_TRACKING.test(String(u || '').trim()); }
// The plain body of the raw form copy often holds ONLY the Brevo tracking link for the CV (no file name): the first backfill (11 Nov) rebuilt nothing, the second logged
// cv_unresolved 295 (every form CV). So the file name is read from the HTML body: first the link whose address is the tracking link we already have (its text is the file name),
// then, failing that, the first link after the "Please upload your CV" label (words may have tags between them). Asked for only when the plain text has no file name.
// A tracking link that still cannot be rebuilt is counted in cv_unresolved and the first few are described in the log (RCT_CV_DIAG): why, the name read, the address tried
// and what the website answered, so the cause is visible instead of guessed.
var RCT_CV_DIAG = [];
const RCT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
function rctDecodeHtml_(t) {
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(t || '').replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, e) {
    if (e.charAt(0) === '#') { const n = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n ? String.fromCharCode(n) : ' '; }
    return ent[e.toLowerCase()] || all;
  }).replace(/\s+/g, ' ').trim();
}
function rctNameOfLinkText_(txt) {
  const t = rctDecodeHtml_(txt); if (!t) return '';
  if (/^https?:\/\//i.test(t)) { try { return decodeURIComponent(t.split('?')[0].split('/').pop()); } catch (e) { return t.split('?')[0].split('/').pop(); } }
  return t;
}
function rctCvNameFromHtml_(html, trk) {
  const h = String(html || ''), want = rctDecodeHtml_(trk || '').replace(/[)\]>.,;]+$/, '');
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(h))) {
    const href = rctDecodeHtml_(m[1]);
    if (want && (href.indexOf(want) === 0 || want.indexOf(href) === 0)) { const n = rctNameOfLinkText_(m[2]); if (n) return n; }
  }
  const i = h.search(/Please[\s\S]{0,60}?upload[\s\S]{0,60}?your[\s\S]{0,60}?CV/i); if (i < 0) return '';
  const m2 = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(h.slice(i, i + 4000)); return m2 ? rctNameOfLinkText_(m2[1]) : '';
}
function rctCvLink_(text, at, getHtml) {
  const t = String(text || ''), urls = t.match(/https?:\/\/[^\s)\]>]+/gi) || [];
  const direct = urls.filter(function (u) { return !rctIsTracking_(u); })[0];
  if (direct) return direct;                                   // a real link already (image uploads, non-Latin file names)
  const trk = urls.filter(rctIsTracking_)[0] || '';
  const diag = function (why, extra) { if (RCT_CV_DIAG.length < 4) RCT_CV_DIAG.push(why + (extra ? ' | ' + extra : '') + ' | plain text: ' + t.slice(0, 120).replace(/\s+/g, ' ')); };
  // the plain body reads "- 2026-Laureen-McCartan-CV1.pdf <https://...tracking link...>": drop the link, the angle brackets and the bullet
  let name = t.replace(/https?:\/\/[^\s)\]>]+/gi, ' ').replace(/[<>]/g, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-\u2022*]+/, '').trim();
  if ((!name || !/\.[A-Za-z0-9]{2,5}$/.test(name)) && trk && getHtml) { try { name = rctCvNameFromHtml_(getHtml(), trk); } catch (e) { name = ''; } }
  if (!name || !/\.[A-Za-z0-9]{2,5}$/.test(name)) { if (trk) { RCT_CV_STATS.unresolved++; diag('no file name found', 'name read: "' + name + '"'); } return ''; }   // no file name to rebuild from
  const when = new Date(at), months = [];
  [when.getTime(), when.getTime() + 4 * 3600000, when.getTime() - 86400000, when.getTime() + 86400000].forEach(function (ms) {
    const d = new Date(ms), k = d.getUTCFullYear() + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
    if (months.indexOf(k) < 0) months.push(k);
  });
  const names = [name]; const dashed = name.replace(/\s+/g, '-'); if (dashed !== name) names.push(dashed);
  // WordPress also trims dots, dashes and underscores off the end of the name before the extension ("Resume.Hair-dresser.pdf1_.pdf" is stored as "Resume.Hair-dresser.pdf1.pdf", the one
  // form CV the 11 Nov backfill could not find), so try that spelling too
  const ex = /^(.*?)[._-]*(\.[A-Za-z0-9]{2,5})$/.exec(dashed); if (ex && ex[1] + ex[2] !== dashed && ex[1]) names.push(ex[1] + ex[2]);
  const cands = []; months.forEach(function (mo) { names.forEach(function (n) { cands.push(RCT_CV_BASE + mo + '/' + encodeURIComponent(n)); }); });
  let codes = [];
  try {
    // Apps Script's UrlFetchApp has no HEAD (method must be get, post, put, patch or delete: the first versions used 'head' and every check threw, cv_unresolved 295), so ask for
    // the first byte of each candidate with a GET: 200 (the whole file) or 206 (one byte) means the file is there, 404 means it is not.
    const res = UrlFetchApp.fetchAll(cands.map(function (u) { return { url: u, method: 'get', muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': RCT_UA, Range: 'bytes=0-0' } }; }));
    codes = res.map(function (r) { return r.getResponseCode(); });
    for (let i = 0; i < res.length; i++) if (codes[i] === 200 || codes[i] === 206) { RCT_CV_STATS.rebuilt++; return cands[i]; }
  } catch (e) { console.log('CV check failed: ' + e); diag('check threw', String(e)); }
  RCT_CV_STATS.unresolved++;
  diag('file not found on the website', 'name "' + name + '", first address ' + cands[0] + ', answers ' + codes.join(','));
  return '';
}

/* ---------- the website form ---------- */
function rctHandle_(h) { return String(h || '').replace(/^@/, '').replace(/\.+$/, ''); }   // a handle at the end of a sentence picks up the full stop
function rctLink_(text) {
  const t = String(text || '').trim(); if (!t) return { work_link: '', link_kind: '', ig_handle: '' };
  let m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(t);
  if (m && !/^(p|reel|reels|explore|stories)$/i.test(m[1])) return { work_link: t, link_kind: 'instagram', ig_handle: rctHandle_(m[1]) };
  if (/instagram\.com/i.test(t)) return { work_link: t, link_kind: 'instagram', ig_handle: '' };
  m = /^@?([A-Za-z0-9._]{2,30})$/.exec(t);
  if (m) return { work_link: t, link_kind: 'instagram', ig_handle: rctHandle_(m[1]) };
  const kind = /tiktok\.com/i.test(t) ? 'tiktok' : /facebook\.com|fb\.com/i.test(t) ? 'facebook' : /linkedin\.com/i.test(t) ? 'linkedin' : /youtu\.?be/i.test(t) ? 'youtube' : /^https?:\/\//i.test(t) ? 'website' : 'other';
  return { work_link: t, link_kind: kind, ig_handle: '' };
}
function rctRoleOf_(text) {
  const s = String(text || '').toLowerCase();
  if (/receptionist|front desk|customer service|call cent/.test(s)) return 'front';
  if (/barber/.test(s)) return 'barber';
  if (/braid|dreadlock|locs\b/.test(s)) return 'braider';
  if (/nail|manicur|pedicur/.test(s)) return 'nails';
  if (/lash|facial|wax|massage|beauty|therapist|aesthetic|skin/.test(s)) return 'beauty';
  if (/colourist|colorist|colour specialist|color specialist/.test(s)) return 'colourist';
  if (/stylist|hairdress|hair\b|balayage|cutting|extension|keratin/.test(s)) return 'stylist';
  return 'other';
}
function rctStructured_(body, at, mailbox, msgId) {
  const f = {}; let key = null;
  body.split(/\r?\n/).forEach(function (ln) {
    const m = /^(Name|Email|WhatsApp|Based in|Experience|Specialist areas|Paths|Brochures sent|Work link|CV|About|Submitted|Lead sheet):\s*(.*)$/.exec(ln);
    if (m) { key = m[1]; f[key] = m[2]; } else if (key === 'About') f.About += '\n' + ln;
  });
  const link = rctLink_(f['Work link']);
  const when = /(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(f.Submitted || '');
  const stamp = when ? new Date(when[1] + 'T' + when[2] + ':00+04:00').toISOString() : at;
  const country = (f['Based in'] || '').trim();
  return Object.assign({
    kind: 'application', source: 'form', name: f.Name, email: f.Email, whatsapp: f.WhatsApp, country: country, emirate: '',
    experience: f.Experience, specialist: f['Specialist areas'], paths: f.Paths, role_key: rctRoleOf_(f['Specialist areas']), role_txt: f.Paths || f['Specialist areas'],
    cv_link: rctIsTracking_(f.CV) ? '' : f.CV, about: (f.About || '').trim().slice(0, 2000), at: stamp, mailbox: mailbox, msg_id: msgId,
  }, link);
}
function rctRawForm_(body, at, mailbox, msgId, getHtml) {
  const labels = ['Full Name', 'Email Address', 'Whatsapp Number', 'Where are you currently based?', 'Which Emirate?', 'Years of Experience', 'Your specialist area', 'Which path interests you most?', 'Tell us about yourself', 'Link to your work', 'Please upload your CV'];
  // GmailApp's plain body of an HTML email can put a label and its value on one line, on two lines or tab separated, so do not rely on line breaks:
  // find each label in order (the form always asks in this order) and take everything up to the next label found (fixed 9 Nov 2026 after the first
  // backfill read only the newer structured copies and skipped about 250 older raw ones).
  const pos = []; let cursor = 0;
  labels.forEach(function (l) { const i = body.indexOf(l, cursor); if (i >= 0) { pos.push({ l: l, i: i }); cursor = i + l.length; } });
  const v = {};
  pos.forEach(function (p, k) {
    const end = k + 1 < pos.length ? pos[k + 1].i : Math.min(body.length, p.i + p.l.length + 2500);
    // the form marks required questions with " *", which lands at the END of the previous answer (and after the label): strip it both sides
    v[p.l] = body.slice(p.i + p.l.length, end).replace(/^[\s:*]+/, '').replace(/[\s*]+$/, '').trim();
  });
  const one = function (k) { return String(v[k] || '').replace(/\s+/g, ' ').trim().slice(0, 300); };
  const list = function (k) { return String(v[k] || '').split(/\r?\n|\t|,\s*/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean); };
  const link = rctLink_(one('Link to your work'));
  const country = one('Where are you currently based?');
  const cvText = one('Please upload your CV');
  return Object.assign({
    kind: 'application', source: 'form', name: one('Full Name'), email: rctAddr_(one('Email Address')), whatsapp: one('Whatsapp Number'), country: country, emirate: one('Which Emirate?'),
    experience: one('Years of Experience'), specialist: list('Your specialist area').join(', '), paths: list('Which path interests you most?').join('; '),
    role_key: rctRoleOf_(list('Your specialist area').join(' ')), role_txt: list('Which path interests you most?').join('; ') || list('Your specialist area').join(', '),
    cv_link: rctCvLink_(cvText, at, getHtml), about: String(v['Tell us about yourself'] || '').replace(/\t/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000),
    at: at, mailbox: mailbox, msg_id: msgId,
  }, link);
}

/* ---------- a direct email: read what we can, leave the rest blank (shown as Not stated, never flagged) ---------- */
const RCT_COUNTRIES = ['Nigeria', 'Kenya', 'Ghana', 'Uganda', 'South Africa', 'Morocco', 'Algeria', 'Tunisia', 'Egypt', 'Lebanon', 'Syria', 'Iraq', 'Iran', 'Jordan', 'Pakistan', 'India', 'Philippines', 'Sri Lanka', 'Nepal', 'Bangladesh', 'Brazil', 'Ukraine', 'Russia', 'Turkey', 'Togo', 'Guinea', 'Cameroon', 'Ethiopia', 'Bahrain', 'United Kingdom', 'France', 'Indonesia'];
function rctDirect_(m, fromAddr, subject, body, at, mailbox, msgId) {
  const text = subject + '\n' + body.slice(0, 3000);
  let country = '', emirate = '';
  const em = /\b(Dubai|Abu Dhabi|Sharjah|Ajman|Al Ain|Ras Al Khaimah|Fujairah|Umm Al Quwain)\b/i.exec(text);
  if (em && /(based|living|currently|located|residing|resident|work(ing)? (in|at)|in|from)\s+[^.\n]{0,25}(dubai|abu dhabi|sharjah|ajman|al ain|ras al khaimah|fujairah|umm al quwain)/i.test(text) && !/relocat\w*\s+to\s+(dubai|abu dhabi|the uae|uae)/i.test(text)) {
    country = 'United Arab Emirates'; emirate = em[1];
  }
  if (!country) {
    const c = new RegExp('(?:from|based in|living in|currently in|located in|residing in|relocat\\w* from|hairstylist from|hairdresser from)\\s+(' + RCT_COUNTRIES.join('|') + ')', 'i').exec(text);
    if (c) country = RCT_COUNTRIES.filter(function (x) { return x.toLowerCase() === c[1].toLowerCase(); })[0] || c[1];
  }
  const yrs = /(\d{1,2})\s*\+?\s*(?:years|yrs)/i.exec(text);
  const ig = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(text) || /instagram[^\n]{0,40}?@([A-Za-z0-9._]{2,30})/i.exec(text);
  const wa = /(\+?\d[\d ()-]{8,16}\d)/.exec(body.slice(0, 3000));
  const otherLink = /(https?:\/\/(?:www\.)?(?:tiktok\.com|facebook\.com|linkedin\.com|youtu\.?be)[^\s)>"]+)/i.exec(text);
  // a CV sent as a cloud link in the message (Gmail turns a big attachment into a Google Drive link, others paste Dropbox, WeTransfer, OneDrive, Canva or an iCloud shared note; an
  // iPhone shows only the first line of a shared note as the text, 'Hello! My name is Hellen...', and the whole letter is behind the link): that link is the CV
  const cloud = /(https?:\/\/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|drive\/folders\/)|docs\.google\.com\/(?:document|file)\/|(?:www\.)?dropbox\.com\/|we\.tl\/|(?:www\.)?wetransfer\.com\/|1drv\.ms\/|onedrive\.live\.com\/|app\.box\.com\/|(?:www\.)?canva\.com\/design\/|(?:www\.)?icloud\.com\/(?:notes|iclouddrive)\/|share\.icloud\.com\/)[^\s)>"]+)/i.exec(body.slice(0, 3000));
  const link = ig ? { work_link: 'https://www.instagram.com/' + rctHandle_(ig[1]), link_kind: 'instagram', ig_handle: rctHandle_(ig[1]) } : otherLink ? rctLink_(otherLink[1]) : { work_link: '', link_kind: '', ig_handle: '' };
  return Object.assign({
    kind: 'application', source: 'email', name: rctNameOf_(m.getFrom()), email: fromAddr, whatsapp: wa ? wa[1] : '', country: country, emirate: emirate,
    experience: yrs ? yrs[1] + ' years' : '', specialist: '', paths: '', role_key: rctRoleOf_(subject + ' ' + body.slice(0, 500)), role_txt: subject.trim().slice(0, 90) || 'Job enquiry',
    cv_link: cloud ? cloud[1] : '', about: body.replace(/\r/g, '').split(/\n>|On .{5,80} wrote:/)[0].trim().slice(0, 2000), at: at, mailbox: mailbox, msg_id: msgId,
  }, link);
}

/* A one-off look at why a message shows no attachment: run debugAttachments() once (pick it in the function list), read the log. It only READS; nothing is sent or changed.
   Message ids are Gmail ids from the dashboard (recruit_applicants.msg_ids). Added 11 Nov 2026. */
function debugAttachments() {
  const ids = ['1a119ff5ebe7662e', '1a0b3abfa86ff624', '1a01565249706bf9'];   // Akash Deep (CV Attached), Merin R, Aqsa Albaloshi
  ids.forEach(function (id) {
    try {
      const m = GmailApp.getMessageById(id);
      const plain = m.getAttachments({ includeInlineImages: false, includeAttachments: true }).length;
      const all = m.getAttachments({ includeInlineImages: true, includeAttachments: true });
      const raw = String(m.getRawContent() || '');
      const parts = (raw.match(/^Content-(Type|Disposition):.*$/gim) || []).slice(0, 14).join(' || ');
      console.log(id + ' | ' + m.getSubject() + ' | without inline: ' + plain + ' | with inline: ' + all.length + ' [' + all.map(function (a) { return a.getName() + ' ' + Math.round(a.getSize() / 1024) + 'KB'; }).join('; ') + '] | raw ' + raw.length + ' chars | ' + parts);
    } catch (e) { console.log(id + ' | could not read: ' + e); }
  });
}
