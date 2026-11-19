/**
 * STANDALONE script, ONE copy, in the recruitment@tararosesalon.com mailbox ONLY (Kate, 16 Nov 2026). It is the SENDER for the dashboard's automatic shortlist email AND for the Send button on every email dialog of the Recruitment page (19 Nov 2026, migrations/recruit_send_email_19nov.sql);
 * apps-script/sync-recruitment-mailbox.gs stays read only and is not changed. This one can SEND but cannot read, label, move or delete any mail: its only Gmail scope is gmail.send.
 *
 * What it does: every minute (it was every 5 until 19 Nov 2026, so a Send press on the Recruitment page goes out quickly) it asks the dashboard Supabase for the emails the Recruitment page queued (recruit_outbox_claim, migrations/recruit_shortlist_email.sql), sends
 * each one FROM this mailbox with GmailApp.sendEmail (formatted HTML plus a plain text part, so the applicant sees recruitment@ and a reply lands in this inbox), and reports
 * sent or failed back (recruit_outbox_finish). A send that fails is marked failed and is NEVER retried by this script, so nobody gets a double email; look at the Recruitment
 * outbox in the database or the Sent folder, then decide. Nothing secret lives in this file.
 *
 * ONE-TIME SETUP (signed in as recruitment@):
 *   1. script.google.com/create, paste this whole file, Project Settings, tick "Show appsscript.json" and set oauthScopes to
 *        ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/script.external_request", "https://www.googleapis.com/auth/script.scriptapp"]
 *      (timeZone Asia/Dubai, runtimeVersion V8). See send-recruitment-mail.appsscript.json.
 *   2. Project Settings, Script Properties, add (the same values the reading script in this mailbox already has):
 *        RSM_ANON_KEY  = the dashboard's publishable (anon) key
 *        RSM_PUSH_PASS = the recruitment mailbox push pass (public.push_passes, active)
 *   3. Run sendTestToMe() once and approve the permission: it sends ONE test email to recruitment@ itself, so you can see how it arrives.
 *   4. Run setupTrigger() once: installs the every minute run (re-run it if the trigger from 16 Nov is still every 5 minutes).
 *   5. Switch it on in the database only after steps 3 and 4:  update public.recruit_settings set value = 'true'::jsonb where key = 'shortlist_email_enabled';
 *      (Until then the Recruitment page queues nothing for real applicants; a Test row still queues a test email to the person who clicked Shortlist.)
 */

const RSM_SUPA = 'https://gvijxenafoowajqktqvd.supabase.co';
const RSM_FROM_NAME = 'Tara Rose Salons';
const RSM_BATCH = 5;
const RSM_BUDGET_MS = 4 * 60 * 1000;

function rsmProp_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Script Properties is missing ' + k + ', see the header comment.');
  return v;
}

function rsmRpc_(name, payload) {
  const key = rsmProp_('RSM_ANON_KEY');
  const resp = UrlFetchApp.fetch(RSM_SUPA + '/rest/v1/rpc/' + name, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload),
  });
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(name + ' said ' + code + ': ' + resp.getContentText().slice(0, 300));
  const body = resp.getContentText();
  return body ? JSON.parse(body) : null;
}

/* ---------- entry points ---------- */
function sendRecruitmentMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.log('Another run is still going, skipping.'); return; }
  const t0 = Date.now(), pass = rsmProp_('RSM_PUSH_PASS'), n = { claimed: 0, sent: 0, failed: 0 };
  try {
    while (Date.now() - t0 < RSM_BUDGET_MS) {
      const jobs = rsmRpc_('recruit_outbox_claim', { p_pass: pass, p_n: RSM_BATCH }) || [];
      if (!jobs.length) break;
      jobs.forEach(function (j) {
        n.claimed++;
        let ok = false, err = '';
        try {
          GmailApp.sendEmail(String(j.to), String(j.subject), String(j.text), { htmlBody: String(j.html), name: RSM_FROM_NAME });
          ok = true;
        } catch (e) { err = String((e && e.message) || e).slice(0, 280); }
        try { rsmRpc_('recruit_outbox_finish', { p_pass: pass, p_id: j.id, p_status: ok ? 'sent' : 'failed', p_error: ok ? null : err }); }
        catch (e2) { console.error('Could not report email ' + j.id + ' (' + (ok ? 'sent' : 'failed') + '): ' + e2.message); }
        if (ok) n.sent++; else n.failed++;
      });
      if (jobs.length < RSM_BATCH) break;
    }
  } finally { lock.releaseLock(); }
  if (n.claimed) console.log(JSON.stringify(n));
}

function sendTestToMe() {
  const me = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(me, '[TEST] Recruitment sender works', 'This is a test from the recruitment sender script. If you can read it, the permission is in place.',
    { htmlBody: '<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px">This is a test from the recruitment sender script. If you can read it, the permission is in place.</p>', name: RSM_FROM_NAME });
  console.log('Test sent to ' + me);
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendRecruitmentMail') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendRecruitmentMail').timeBased().everyMinutes(1).create();
  console.log('Trigger installed: every minute.');
}
