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

function rctRun_(fromMs, toMs, dry) {
  const t0 = Date.now(), seen = {}, rows = [], own = rctOwnAddr_();
  rctQueries_(fromMs, toMs).forEach(function (q) {
    for (let start = 0; start < 1500; start += 100) {
      if (Date.now() - t0 > RCT_BUDGET_MS) throw new Error('Out of time, run again for a smaller window (BACKFILL_FROM / BACKFILL_TO).');
      const threads = GmailApp.search(q, start, 100);
      threads.forEach(function (th) {
        th.getMessages().forEach(function (m) {
          const id = m.getId(); if (seen[id]) return;
          const d = m.getDate().getTime(); if (d < fromMs || (toMs && d >= toMs)) return;
          seen[id] = 1;
          const r = rctClassify_(m, own); if (r) rows.push(r);
        });
      });
      if (threads.length < 100) break;
    }
  });
  // an application with no email, no WhatsApp and no name cannot be told apart from anyone else, so the database skips it: count them so a parsing gap shows in the log
  const totals = { dry: dry, sent: rows.length, blank_applications: rows.filter(function (r) { return r.kind === 'application' && !r.email && !r.whatsapp && !r.name; }).length, kinds: {} };
  rows.forEach(function (r) { totals.kinds[r.kind + (r.source ? '/' + r.source : '')] = (totals.kinds[r.kind + (r.source ? '/' + r.source : '')] || 0) + 1; });
  for (let i = 0; i < rows.length; i += 200) {
    const res = rctPush_(rows.slice(i, i + 200), dry);
    Object.keys(res).forEach(function (k) { if (typeof res[k] === 'number') totals[k] = (totals[k] || 0) + res[k]; });
  }
  console.log(JSON.stringify(totals));
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
  if (/^Recruitment Form submission/i.test(subject)) return rctRawForm_(body, at, mailbox, msgId);

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
    cv_link: f.CV, about: (f.About || '').trim().slice(0, 2000), at: stamp, mailbox: mailbox, msg_id: msgId,
  }, link);
}
function rctRawForm_(body, at, mailbox, msgId) {
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
  const cvText = one('Please upload your CV'), cvUrl = /https?:\/\/\S+/i.exec(cvText);
  return Object.assign({
    kind: 'application', source: 'form', name: one('Full Name'), email: rctAddr_(one('Email Address')), whatsapp: one('Whatsapp Number'), country: country, emirate: one('Which Emirate?'),
    experience: one('Years of Experience'), specialist: list('Your specialist area').join(', '), paths: list('Which path interests you most?').join('; '),
    role_key: rctRoleOf_(list('Your specialist area').join(' ')), role_txt: list('Which path interests you most?').join('; ') || list('Your specialist area').join(', '),
    cv_link: cvUrl ? cvUrl[0] : '', about: String(v['Tell us about yourself'] || '').replace(/\t/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000),
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
  const link = ig ? { work_link: 'https://www.instagram.com/' + rctHandle_(ig[1]), link_kind: 'instagram', ig_handle: rctHandle_(ig[1]) } : otherLink ? rctLink_(otherLink[1]) : { work_link: '', link_kind: '', ig_handle: '' };
  return Object.assign({
    kind: 'application', source: 'email', name: rctNameOf_(m.getFrom()), email: fromAddr, whatsapp: wa ? wa[1] : '', country: country, emirate: emirate,
    experience: yrs ? yrs[1] + ' years' : '', specialist: '', paths: '', role_key: rctRoleOf_(subject + ' ' + body.slice(0, 500)), role_txt: subject.trim().slice(0, 90) || 'Job enquiry',
    cv_link: '', about: body.replace(/\r/g, '').split(/\n>|On .{5,80} wrote:/)[0].trim().slice(0, 2000), at: at, mailbox: mailbox, msg_id: msgId,
  }, link);
}
