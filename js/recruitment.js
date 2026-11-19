/* Recruitment (Kate, 9 Nov 2026), a dashboard page in Tools (?view=recruitment) for Kate and Coach Emma only. One list of applicants from the recruitment and info
   inboxes: Worth a look (every check passed), Probably no (flagged, opened by reason), Waiting (no reply yet), In progress and Not now. Mockup approved 9 Nov 2026
   (docs/mockups/recruitment-triage.html in the cowork repo). Data: recruit_get() / recruit_set_stage() / recruit_settings_set() (migrations/recruitment.sql), filled
   every 5 minutes by apps-script/sync-recruitment-mailbox.gs. The page never sends email: Shortlist opens a ready reply (copy it, or open it in Gmail from the
   recruitment inbox) and Mark as invited moves the person to Screening. Stage names are the TRS Recruitment/ labels already in the inboxes.
   Access: Level 5, or dashboard_users.extra_pages holds 'recruitment' (pages.js trsPageOpen); the database checks the same. Needs sb and TRS_LEVEL. */
(function () {
  function main() { return document.getElementById('recruitmentContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\/[^\s]+$/i.test(u) ? u : ''; }
  // Kate, 11 Nov 2026: a Brevo click-tracking link (sendibt, brevo.net) is dead (404) and hides the real file, so it never counts as a usable CV link.
  function deadCv(p) { return /^https?:\/\/[^\/]*(sendibt\d*|brevo)[^\/]*\//i.test(String(p.cv_link || '').trim()); }
  function cvUrl(p) { return deadCv(p) ? '' : safeUrl(p.cv_link); }
  function pl(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var ROLES = [['stylist', 'Hair stylist'], ['colourist', 'Colourist'], ['beauty', 'Beauty therapist'], ['nails', 'Nail technician'],
               ['front', 'Front desk'], ['barber', 'Barber'], ['braider', 'Hair braider']];
  // Kate, 16 Nov 2026 (hiring steps for assistants and reception, now for everyone after the interview): Shortlist, Interview done (pass or fail), Trade test scheduled, Trade test done
  // (pass or fail), For offer letter (to send, sent), Finalise start date (pending, accepted by the applicant), Hired. A fail is the last status. 'offer' is the old name of 'offer_to_send'.
  var STAGE_LABEL = { new: 'New', screening: 'Shortlisted', interview_booked: 'Interview booked', interview_pass: 'Interview done (pass)', interview_fail: 'Interview done (fail)',
    trade_test: 'Trade test scheduled', trade_fail: 'Trade test done (fail)', trade_pass: 'Trade test done (pass)', offer: 'For offer letter (to send)', offer_to_send: 'For offer letter (to send)',
    offer_sent: 'For offer letter (sent)', start_pending: 'Finalise start date (pending)', start_accepted: 'Finalise start date (accepted)', hired: 'Hired', not_now: 'Not now', rejected: 'Rejected' };
  var STAGE_ORDER = ['new', 'screening', 'interview_booked', 'interview_pass', 'interview_fail', 'trade_test', 'trade_pass', 'trade_fail', 'offer', 'offer_to_send', 'offer_sent', 'start_pending', 'start_accepted', 'hired', 'not_now', 'rejected'];
  var PAGE = 10;   // Kate, 10 Nov 2026: 10 cards at a time in Grid (Show 10 more); the List has its own Rows per page (10, 20, 50, 100)
  var C = null, loadErr = '', rows = [], gone = [], settings = {}, settingsMeta = {}, me = '', q = '', shownLook = PAGE, shownNo = {}, bound = false, toastTimer = null, openRows = {};
  var UNDO = [];

  function setting(k, d) { return settings[k] == null ? d : settings[k]; }
  function openRoles() { return setting('open_roles', { stylist: true, colourist: true, beauty: true, nails: true }); }
  // Kate, 10 Nov 2026: "let me type what is needed instead". The roles we are hiring for are typed, separated by commas (setting open_roles_text).
  // Until she types, it starts from the old switches so nothing changes by itself. A typed role matches a person when it names their role group
  // (stylist, colourist, beauty, nails, front desk, barber, braider, with the usual other words) or appears in what they wrote for the role.
  var ROLE_WORDS = { stylist: ['stylist', 'hairdresser'], colourist: ['colourist', 'colorist'], beauty: ['beauty', 'therapist'], nails: ['nail'], front: ['front desk', 'reception'], barber: ['barber'], braider: ['braid'] };
  function openText() {
    var t = settings.open_roles_text;
    if (typeof t === 'string') return t;
    var open = openRoles();
    return ROLES.filter(function (r) { return open[r[0]] === true; }).map(function (r) { return r[1]; }).join(', ');
  }
  function openTerms() { return openText().split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function roleListed(p, terms) {
    var hay = [p.role_txt, p.paths, p.specialist].join(' ').toLowerCase();
    return terms.some(function (term) {
      var t = term.toLowerCase();
      if (p.role_key && ROLE_WORDS[p.role_key] && ROLE_WORDS[p.role_key].some(function (w) { return t.indexOf(w) >= 0; })) return true;
      return t.length >= 3 && hay.indexOf(t) >= 0;
    });
  }
  function waitDays() { var n = +setting('wait_days', 14); return n > 0 ? n : 14; }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || 'there'; }
  // Kate, 16 Nov 2026: who moved a person to their current status (decided_by, set by the database from the signed-in account) and when. Empty for a person nobody has moved.
  function byWho(p) { return p && p.stage !== 'new' && p.decided_by ? firstName(p.decided_by) : ''; }
  function byLine(p) { var w = byWho(p); return w ? 'by ' + w + (p.decided_at ? ', ' + fat(p.decided_at) : '') : ''; }
  // Kate, 17 Nov 2026 ("since may access na si ate frans and ate jho sa recruitment page, dapat pag may binago sila nakareflect ang name nila"): the LAST change on a person, whoever made it
  // and whatever it was (status, Applying for, name, Worth a look, photo, CV, Not an applicant, Test). The database writes it (edited_by, edited_at, edited_what) from the signed-in
  // account's name, never from this page. A person moved before this existed shows the move that decided_by holds.
  function lastEdit(p) {
    if (!p) return null;
    if (p.edited_at && p.edited_by) return { by: p.edited_by, at: p.edited_at, what: p.edited_what || 'Changed' };
    if (p.stage !== 'new' && p.decided_by && p.decided_at) return { by: p.decided_by, at: p.decided_at, what: 'Status: ' + (STAGE_LABEL[p.stage] || p.stage) };
    return null;
  }
  function editedLabel(p) { var e = lastEdit(p); return e ? firstName(e.by) : 'No changes yet'; }
  var EDIT_WHAT = {
    recruit_set_role: function (a) { return a.p_to ? 'Applying for: ' + a.p_to : 'Applying for: back to automatic'; },
    recruit_set_name: function (a) { return a.p_name ? 'Edited the name' : 'Name: cleared, the imported name returns'; },
    recruit_set_bucket: function (a) { return a.p_to === 'look' ? 'Moved to Worth a look' : a.p_to === 'no' ? 'Moved to Probably no' : 'Back to the automatic checks'; },
    recruit_set_not_applicant: function (a) { return a.p_flag ? 'Marked as not an applicant' : 'Put back as an applicant'; },
    recruit_set_photo: function (a, p) { return p && p.photo ? 'Changed the photo' : 'Added a photo'; },
    recruit_clear_photo: function () { return 'Removed the photo'; },
    recruit_set_photo_flag: function (a) { return a.p_flag ? 'Marked the photo not professional' : 'Took off the not professional mark'; },
    recruit_set_cv: function (a, p) { return p && p.cv_file ? 'Changed the CV' : 'Attached a CV'; },
    recruit_set_test: function (a) { return a.p_flag ? 'Marked as a Test row' : 'Took off the Test mark'; },
    recruit_set_stage: function (a) { return a.p_stage === 'new' ? 'Status: back to New' : 'Status: ' + (STAGE_LABEL[a.p_stage] || a.p_stage); },
    recruit_move: function (a) { return 'Status: ' + (STAGE_LABEL[a.p_stage] || a.p_stage); },
    recruit_set_hired: function () { return 'Status: Hired'; },
    recruit_set_pref: function (a) { return a.p_loc ? 'Preferred location: ' + a.p_loc : 'Preferred location: cleared'; }
  };
  // every saving call goes through here: when the database accepts it, the row on the page shows the same "last change" the database just wrote (the next load reads it back)
  async function rpcEdit(name, args) {
    var r = await sb.rpc(name, args);
    if (!r.error && EDIT_WHAT[name]) {
      var ids = args.p_ids || [args.p_id], now = new Date().toISOString();
      ids.forEach(function (id) { var p = personById(id); if (p) { p.edited_by = me; p.edited_at = now; p.edited_what = EDIT_WHAT[name](args, p); } });
    }
    return r;
  }
  function editLine(p) { var e = lastEdit(p); return e ? esc(e.what) + ' by ' + esc(firstName(e.by)) + ', ' + esc(fat(e.at)) : ''; }
  // Kate, 17 Nov 2026: a setting (booking link, replies, hiring roles) shows who last CHANGED it. The database only stamps a name when the value really changed.
  function setBy(k) { var m = settingsMeta[k]; return m && m.by ? 'Last changed by ' + firstName(m.by) + (m.at ? ', ' + fat(m.at) : '') : ''; }
  function setNote(k) { var t = setBy(k); return t ? '<small class="rct-sethist">' + esc(t) + '</small>' : ''; }
  async function showHistory(id) {
    var p = personById(id); if (!p) return;
    openDlg('Who changed what: ' + esc(firstName(p.name)), '<p class="rct-hint">Loading.</p>');
    var body = document.querySelector('#rctDlg .rct-db');
    try {
      var r = await sb.rpc('recruit_history', { p_id: p.id }); if (r.error) throw new Error(r.error.message);
      var l = r.data || [];
      var tf = function (iso) { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
      if (body) body.innerHTML = l.length ? '<ul class="rct-hist">' + l.map(function (x) { return '<li><b>' + esc(firstName(x.by)) + '</b> ' + esc(x.what) + '<span>' + esc(tf(x.at)) + '</span></li>'; }).join('') + '</ul>' +
        '<p class="rct-hint">Newest first. The time is Dubai time.</p>' : '<p class="rct-hint">Nobody has changed anything on this person yet.</p>';
    } catch (e) { console.error(e); if (body) body.innerHTML = '<p class="rct-amberbox">That did not load: ' + esc(e.message || 'try again') + '</p>'; }
  }
  function dayMs() { return 86400000; }
  function waited(p) { return Math.max(0, Math.floor((Date.now() - new Date(p.applied_at).getTime()) / dayMs())); }
  function fat(iso) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }).format(new Date(iso)); } catch (e) { return ''; }
  }

  /* ---------- reading one person ---------- */
  function where(p) { // uae, bah, abroad, or unknown (not stated: never flagged)
    var c = String(p.country || '').toLowerCase();
    if (/emirates|^uae$|\buae\b/.test(c) || (!c && p.emirate)) return 'uae';
    if (/bahrain/.test(c)) return 'bah';
    return c ? 'abroad' : 'unknown';
  }
  function hasIg(p) { return !!(p.ig_handle || p.link_kind === 'instagram'); }
  var PLAT_WORD = /^@?(tiktok|tik tok|facebook|fb|youtube|linkedin|threads|twitter|x|instagram)$/i;   // typed in the Instagram box instead of a handle
  function igUrl(p) {
    if (p.ig_handle && PLAT_WORD.test(String(p.ig_handle).trim())) return '';
    if (p.ig_handle) return 'https://www.instagram.com/' + encodeURIComponent(String(p.ig_handle).replace(/^@/, ''));
    return p.link_kind === 'instagram' ? safeUrl(p.work_link) : '';
  }
  // Kate, 11 Nov 2026: the standard. WORTH A LOOK = a work link on Instagram or Facebook, a CV and a professional profile photo. PROBABLY NO = any one of: no profile photo, a photo
  // marked "not professional" (Kate or Emma click that, a program cannot judge it), no CV, no Instagram or Facebook link, not based in the UAE, role not on the open list.
  // A CV link that is dead (Brevo) still counts as a CV; a direct email never counts as "no CV" or "no link" on its own, because its CV is an attached file and it has no form fields.
  function hasIgFb(p) { return hasIg(p) || p.link_kind === 'facebook'; }
  var FLAG_NAME = { hand: 'Moved to Probably no by hand', abroad: 'Not based in the UAE', noph: 'No profile photo', badph: 'Photo not professional', nocv: 'No CV', noig: 'No Instagram or Facebook given', role: 'Role not on your open list' };
  var FLAG_SHORT = { hand: 'By hand', abroad: 'Not in the UAE', noph: 'No photo', badph: 'Photo not professional', nocv: 'No CV', noig: 'No Instagram or Facebook', role: 'Role not open' };
  function flags(p) {
    var f = [], w = where(p);
    if (p.no_ok && !p.look_ok) f.push({ k: 'hand', t: FLAG_NAME.hand });
    if (w === 'abroad') f.push({ k: 'abroad', t: 'Not based in the UAE' + (/relocat/i.test(p.about || '') ? ' (says they can relocate)' : '') });
    if (!p.photo) f.push({ k: 'noph', t: FLAG_NAME.noph });
    else if (p.photo_bad) f.push({ k: 'badph', t: FLAG_NAME.badph });
    if (p.source === 'form' && !String(p.cv_link || '').trim()) f.push({ k: 'nocv', t: FLAG_NAME.nocv });
    // a form always asks for a work link, so none means no Instagram or Facebook; a direct email only counts when it gave some other link
    if (!hasIgFb(p) && (p.source === 'form' || p.link_kind)) {
      var kind = p.link_kind && p.link_kind !== 'instagram' ? ({ tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' }[p.link_kind] || p.link_kind) : '';
      f.push({ k: 'noig', t: kind ? 'No Instagram or Facebook (gave a ' + kind + ' link instead)' : FLAG_NAME.noig });
    }
    var terms = openTerms();
    if (p.role_key && p.role_key !== 'other' && terms.length && !roleListed(p, terms)) {
      var nm = ROLES.filter(function (r) { return r[0] === p.role_key; })[0];
      f.push({ k: 'role', t: 'Applying as ' + (nm ? nm[1].toLowerCase() : p.role_key) + ', not on your open list' });
    }
    return f;
  }
  function bucket(p) {
    // Kate, 11 Nov 2026: Kate or Coach Emma can move a person to Worth a look by hand (look_override), whatever the checks say; the checks stay visible on the card
    if (p.stage === 'new') return p.look_ok ? 'look' : (p.no_ok || flags(p).length) ? 'no' : 'look';
    if (p.stage === 'screening') return 'invited';
    if (p.stage === 'interview_booked') return 'booked';
    if (p.stage === 'not_now' || p.stage === 'rejected' || p.stage === 'interview_fail' || p.stage === 'trade_fail') return 'done';
    return 'later';
  }
  function isLate(p) { return p.stage === 'new' && !p.replied_at && waited(p) >= waitDays(); }
  function by(b) { return rows.filter(function (p) { return !p.is_test && bucket(p) === b; }).sort(function (a, c) { return new Date(a.applied_at) - new Date(c.applied_at); }); }
  function lateList() { return rows.filter(function (p) { return !p.is_test && isLate(p); }).sort(function (a, c) { return new Date(a.applied_at) - new Date(c.applied_at); }); }

  /* ---------- pieces ---------- */
  function waitPill(p) {
    if (p.stage !== 'new') return '';
    if (p.replied_at) return '<span class="rct-pill rct-grey">We replied ' + esc(fat(p.replied_at)) + '</span>';
    var d = waited(p), wd = waitDays(), cls = d >= wd + 7 ? 'rct-red' : d >= wd ? 'rct-amber' : 'rct-grey';
    return '<span class="rct-pill ' + cls + '">Waiting ' + pl(d, 'day', 'days') + '</span>';
  }
  function extraPills(p) {
    var s = '';
    if (p.bounced) s += '<span class="rct-pill rct-red">Email bounced, use WhatsApp</span>';
    if (p.candidate_replied_at && p.stage === 'new') s += '<span class="rct-pill rct-teal">Replied ' + esc(fat(p.candidate_replied_at)) + '</span>';
    return s;
  }
  function stageCls(p) {
    var g = ['interview_booked', 'interview_pass', 'trade_pass', 'offer', 'offer_to_send', 'offer_sent', 'start_accepted', 'hired'], gr = ['not_now', 'rejected', 'interview_fail', 'trade_fail'];
    return g.indexOf(p.stage) >= 0 ? 'rct-green' : gr.indexOf(p.stage) >= 0 ? 'rct-grey' : 'rct-teal';
  }
  function stagePill(p) {
    if (p.stage === 'new') return '';
    var cls = stageCls(p);
    return '<span class="rct-pill ' + cls + '"' + (byLine(p) ? ' title="' + esc(byLine(p)) + '"' : '') + '>' + esc(STAGE_LABEL[p.stage] || p.stage) + '</span>';
  }
  function stated(v) { return v ? esc(v) : '<span class="rct-ns">Not stated</span>'; }
  function placeOf(p) {
    var bits = [p.emirate, p.country].filter(Boolean);
    return bits.length ? esc(bits.join(', ')) : '<span class="rct-ns">Not stated</span>';
  }
  // Kate, 10 Nov 2026: the Instagram column is "Link to work", with a small logo for where the link goes: Instagram, Facebook, X, Google Drive or a cloud store.
  var LK_ICON = {
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="#E1306C" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="#E1306C" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="#E1306C"/></svg>',
    fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#1877F2"/><path fill="#fff" d="M13.5 20v-7h2.4l.4-2.8h-2.8V8.5c0-.8.3-1.4 1.4-1.4h1.5V4.6c-.3 0-1.1-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v1.9H8v2.8h2.5v7z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#111" stroke="#666" stroke-width="1"/><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
    drive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F9D58" d="M8 3 1 15l4 6.5L12 9.5z"/><path fill="#F4B400" d="M8 3h8l7 12h-8z"/><path fill="#4285F4" d="M5 21.5h14l4-6.5H9z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#6FA3DA" d="M7 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.3 4.9 4.9 0 0 1 17.5 19z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#000" stroke="#555" stroke-width="1"/><g fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6" stroke="#25F4EE" transform="translate(-0.8 -0.6)"/><path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6" stroke="#FE2C55" transform="translate(0.8 0.6)"/><path d="M13.6 5.5v8.7a2.6 2.6 0 1 1-2.6-2.6M13.6 5.5c.3 1.9 1.6 3.1 3.6 3.3" stroke="#fff"/></g></svg>',
    threads: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#111" stroke="#666" stroke-width="1"/><path d="M16.4 11.3c-.2-2.3-1.5-3.6-3.9-3.6-1.6 0-2.8.8-3.4 2m7.3 1.6c-.6-.3-1.4-.5-2.3-.5-1.7 0-2.8.8-2.8 2 0 1.1.9 1.9 2.2 1.9 1.7 0 2.8-1.1 2.8-3.2 0 2.3-1.3 4.6-4.2 4.6-2.7 0-4.4-1.8-4.4-4.8s1.7-4.8 4.4-4.8c2.1 0 3.6 1 4.2 2.9" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    other: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="#9aa0b4" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  var LK_NAME = { ig: 'Instagram', fb: 'Facebook', x: 'X', tiktok: 'TikTok', threads: 'Threads', drive: 'Google Drive', cloud: 'Cloud storage', other: 'Other link' };
  function workUrl(p) {   // the work link as a full address; "www.tiktok.com/@x" written without https:// gets one
    var u = String(p.work_link || '').trim();
    if (/^https?:\/\//i.test(u)) return safeUrl(u);
    return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(u) ? safeUrl('https://' + u) : '';
  }
  function linkHost(p) { var m = /^https?:\/\/(?:www\.|m\.)?([^\/?#:]+)/i.exec(workUrl(p)); return m ? m[1].toLowerCase() : ''; }
  function linkKind(p) {   // ig, fb, x, tiktok, drive, cloud, other, or '' when they gave no link
    var hw = String(p.ig_handle || '').trim().toLowerCase().replace(/^@/, '');
    if (hw && PLAT_WORD.test(hw)) return /tik/.test(hw) ? 'tiktok' : /^(facebook|fb)$/.test(hw) ? 'fb' : /^(twitter|x)$/.test(hw) ? 'x' : /^threads$/.test(hw) ? 'threads' : /^instagram$/.test(hw) ? 'ig' : 'other';
    if (hasIg(p)) return 'ig';
    var h = linkHost(p); if (!h) return '';
    if (/(^|\.)instagram\.com$/.test(h)) return 'ig';
    if (/(^|\.)(facebook|fb)\.com$|^fb\.me$/.test(h)) return 'fb';
    if (/(^|\.)tiktok\.com$/.test(h) || p.link_kind === 'tiktok') return 'tiktok';
    if (/^(x|twitter)\.com$|^t\.co$/.test(h)) return 'x';
    if (/(^|\.)threads\.(net|com)$/.test(h)) return 'threads';   // Kate, 16 Nov 2026: a Threads link says Threads, not Other link
    if (/^(drive|docs)\.google\.com$|^drive\.usercontent\.google\.com$/.test(h)) return 'drive';
    if (/dropbox\.com$|onedrive\.live\.com$|^1drv\.ms$|sharepoint\.com$|icloud\.com$|wetransfer\.com$|^we\.tl$|(^|\.)box\.com$|mega\.nz$|pcloud\.com$|mediafire\.com$/.test(h)) return 'cloud';
    return 'other';
  }
  function linkName(p) { var k = linkKind(p); if (k !== 'other') return LK_NAME[k] || ''; return ({ linkedin: 'LinkedIn', youtube: 'YouTube', facebook: 'Facebook' }[p.link_kind]) || (linkHost(p) === 'wa.me' ? 'WhatsApp' : 'Other link'); }
  function linkUrl(p) { return igUrl(p) || workUrl(p); }
  function lk(kind, inner) { return '<span class="rct-lk"><span class="rct-lki" title="' + esc(LK_NAME[kind] || '') + '">' + LK_ICON[kind] + '</span>' + inner + '</span>'; }
  function igHtml(p) {
    var k = linkKind(p), u = linkUrl(p);
    if (k === 'ig') {
      var label = p.ig_handle ? '@' + String(p.ig_handle).replace(/^@/, '') : 'Instagram';
      return lk('ig', u ? '<a class="rct-ig" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label) + '</a>' : esc(label));
    }
    if (k) return lk(k, u ? '<a class="rct-ig" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(linkName(p)) + '</a>' : esc(linkName(p)) + ' <span class="rct-ns">(no link given)</span>');
    return p.source === 'form' ? '<span class="rct-none">None given</span>' : '<span class="rct-ns">Not stated</span>';
  }
  // Kate, 11 Nov 2026: change Worth a look / Probably no by hand, both ways ("i should be able to change sa column sa row din mismo"); the Status cell has the dropdown, the Look panel
  // has the same moves as buttons. Only while the person is new.
  function autoBucket(p) { return flags(p).filter(function (f) { return f.k !== 'hand'; }).length ? 'no' : 'look'; }
  function bkBtn(p, to, label, cls) { return '<button type="button" class="' + cls + '" data-act="bk" data-to="' + to + '" data-id="' + esc(p.id) + '">' + label + '</button>'; }
  function lookBtn(p, cls) {
    if (p.stage !== 'new') return '';
    var b = bucket(p), s = '';
    s += b === 'look' ? bkBtn(p, 'no', 'Move to Probably no', cls) : bkBtn(p, 'look', 'Move to Worth a look', cls);
    if (p.look_ok || p.no_ok) s += bkBtn(p, 'auto', 'Put back to automatic', cls);
    return s;
  }
  function linksHtml(p) {
    var s = '', cv = cvUrl(p);
    if (cv) s += '<a href="' + esc(cv) + '" target="_blank" rel="noopener"' + (cvIsWord(p) ? ' title="' + CV_WORD_TIP + '"' : '') + '>' + (cvIsWord(p) ? '↓ ' : '') + 'CV' + (cvIsWord(p) ? ' (Word)' : '') + '</a>';
    else if (p.cv_file) s += '<button type="button" class="rct-linkbtn" data-act="cvfile" data-id="' + esc(p.id) + '"' + (cvIsWord(p) ? ' title="' + CV_WORD_TIP + '"' : '') + '>' + (cvIsWord(p) ? '↓ ' : '') + 'CV (' + esc(p.cv_file_name || 'attached file') + ')</button>';
    // Kate, 16 Nov 2026 ("paki attach nang maayos now na nung cv nya"): a CV that did not come through (a picture of a CV, a link that died, a paper copy) can be attached by hand.
    if (!cv && !p.cv_file) s += '<label class="rct-linkbtn rct-attach">Attach CV<input type="file" class="rct-sr" data-attach="' + esc(p.id) + '" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"></label>';
    if (p.email) s += '<a href="https://mail.google.com/mail/?authuser=recruitment@tararosesalon.com#search/' + encodeURIComponent(p.email) + '" target="_blank" rel="noopener">Their emails in Gmail</a>';
    var wa = String(p.whatsapp || '').replace(/\D/g, '');
    if (wa.length >= 9) s += '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>';
    s += '<button type="button" class="rct-linkbtn" data-act="photo" data-id="' + esc(p.id) + '">' + (p.photo ? 'Change photo' : 'Add photo') + '</button>';
    if (p.photo) s += photoBadBtn(p, 'rct-linkbtn');
    s += lookBtn(p, 'rct-linkbtn');
    s += '<button type="button" class="rct-linkbtn" data-act="notapp" data-id="' + esc(p.id) + '">Not an applicant</button>';
    if (p.photo) s += '<button type="button" class="rct-linkbtn" data-act="photoclear" data-id="' + esc(p.id) + '">Remove photo</button>';
    return s ? '<div class="rct-links">' + s + '</div>' : '';
  }
  function aboutHtml(p) {
    if (!p.about) return '';
    return '<details class="rct-about" data-id="' + esc(p.id) + '"><summary>What they wrote</summary><p>' + esc(p.about) + '</p></details>';
  }
  function factsHtml(p) {
    return '<div class="rct-facts">' +
      '<div class="rct-fact"><span>Based in</span><b>' + placeOf(p) + '</b></div>' +
      '<div class="rct-fact"><span>Link to work</span><b>' + igHtml(p) + '</b></div>' +
      '<div class="rct-fact"><span>Experience</span><b>' + stated(p.experience) + '</b></div>' +
      '<div class="rct-fact"><span>Applying for</span><b>' + roleSelect(p) + '<div class="rct-roleraw">' + roleLine(p) + '</div></b></div>' +
      (p.reviewed_by && p.reviewed_at && p.reviewed_by !== 'earlier decision' ? '<div class="rct-fact"><span>First looked at</span><b>' + esc(firstName(p.reviewed_by)) + ', ' + esc(fat(p.reviewed_at)) + '</b></div>' : '') +
      (p.stage === 'new' ? '<div class="rct-fact"><span>Status</span><b>' + statusSelect(p) + '</b></div>' : '') +
      '<div class="rct-fact"><span>Assigned to</span><b>' + (p.assigned_to ? '' : '<span class="rct-ns">Nobody yet</span> ') + asgHtml(p) + '</b></div>' +
      '<div class="rct-fact"><span>Last change</span><b>' + (editLine(p) || '<span class="rct-ns">No changes yet</span>') + ' <button type="button" class="rct-linkbtn" data-act="hist" data-id="' + esc(p.id) + '">Who changed what</button></b></div>' +
      '<div class="rct-fact"><span>Applied</span><b>' + esc(fat(p.applied_at)) + ' <span class="rct-src">(' + (p.source === 'form' ? 'website form' : 'email') + (p.merged > 1 ? ', ' + p.merged + ' emails merged' : '') + ')</span></b></div>' +
      '</div>';
  }
  // the open "Look" panel under a row: everything the card shows, so a person can be read without leaving the list (opening it counts as reviewing them)
  function detailHtml(p) {
    return '<div class="rct-rowdetail">' + factsHtml(p) + (p.about ? '<p class="rct-aboutfull"><b>What they wrote:</b> ' + esc(p.about) + '</p>' : '') + linksHtml(p) + '</div>';
  }
  function roleLine(p) { return esc(p.role_txt || p.paths || p.specialist || '') || '<span class="rct-ns">Not stated</span>'; }

  // Kate, 11 Nov 2026: "difficult to sift through pag grid style". The card is now a decision card, built from the doctrine (start from the real job, one decision at a time, show what
  // they already know): the person, the trade and what they want on two lines, then Kate's own standard as four ticks (photo, Instagram or Facebook, CV, in the UAE) so one glance says
  // why they are Worth a look or Probably no, then Shortlist, No and Look. Everything else (facts, what they wrote, links) opens with Look. About 3 cards across on a wide screen.
  function chip(kind, text, tag, attrs) {
    var cls = 'rct-chip rct-' + kind, mark = kind === 'ok' ? '\u2713 ' : kind === 'x' ? '\u2717 ' : '\u2013 ';
    return '<' + tag + ' class="' + cls + '"' + (attrs || '') + (tag === 'button' ? ' type="button"' : '') + '>' + mark + esc(text) + '</' + tag + '>';
  }
  function checkChips(p) {
    var h = [], k = linkKind(p), u = linkUrl(p), w = where(p);
    h.push(!p.photo ? chip('x', 'No photo', 'span') : p.photo_bad ? chip('x', 'Photo not professional', 'span') : chip('ok', 'Photo', 'span'));
    if (k === 'ig' || k === 'fb') h.push(u ? chip('ok', k === 'ig' ? 'Instagram' : 'Facebook', 'a', ' href="' + esc(u) + '" target="_blank" rel="noopener"') : chip('ok', k === 'ig' ? 'Instagram' : 'Facebook', 'span'));
    else if (k) h.push(u ? chip('nt', linkName(p), 'a', ' href="' + esc(u) + '" target="_blank" rel="noopener"') : chip('nt', linkName(p), 'span'));
    else h.push(p.source === 'form' ? chip('x', 'No Instagram or Facebook', 'span') : chip('nt', 'No link given', 'span'));
    var cu = cvUrl(p);
    if (cu) h.push(chip('ok', cvIsWord(p) ? 'CV ↓' : 'CV', 'a', ' href="' + esc(cu) + '" target="_blank" rel="noopener"' + (cvIsWord(p) ? ' title="' + CV_WORD_TIP + '"' : '')));
    else if (p.cv_file) h.push(chip('ok', cvIsWord(p) ? 'CV ↓' : 'CV', 'button', ' data-act="cvfile" data-id="' + esc(p.id) + '"' + (cvIsWord(p) ? ' title="' + CV_WORD_TIP + '"' : '')));
    else if (deadCv(p)) h.push(chip('x', 'CV link broken', 'span'));
    else if (inEmail(p)) h.push(chip('nt', 'CV in the email', 'span'));
    else h.push(chip('x', 'No CV', 'span'));
    h.push(w === 'uae' ? chip('ok', 'In the UAE', 'span') : w === 'abroad' ? chip('x', 'Not in the UAE', 'span') : w === 'bah' ? chip('nt', 'Bahrain', 'span') : chip('nt', 'Place not stated', 'span'));
    return h.join('');
  }
  function card(p) {
    var emp = empType(p), bits = [roleGroup(p), emp, p.experience || ''].filter(function (x) { return x && x !== 'Not stated'; });
    return '<article class="rct-card rct-cardc">' +
      '<div class="rct-ctop"><div class="rct-cwho">' + avatar(p, true) + '<div class="rct-cname"><h3>' + esc(p.name || 'Name not stated') + '</h3>' + '<button type="button" class="rct-pen" data-act="rename" data-id="' + esc(p.id) + '" title="Edit name" aria-label="Edit name"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></button>' + '<span class="rct-csub">' + esc(bits.join(' \u00b7 ')) + '</span><div class="rct-pills rct-cpills">' + waitPill(p) + (p.look_ok && autoBucket(p) === 'no' ? '<span class="rct-pill rct-teal">Moved here by hand</span>' : '') + extraPills(p) + '</div></div></div></div>' +
      '<div class="rct-chips">' + checkChips(p) + '</div>' +
      '<div class="rct-asgrow">' + asgHtml(p) + '</div>' +
      '<div class="rct-btns rct-btns3"><button type="button" class="rct-btn rct-pri" data-act="short" data-id="' + esc(p.id) + '">Shortlist</button>' +
      '<button type="button" class="rct-btn" data-act="no" data-id="' + esc(p.id) + '">No</button>' +
      '<button type="button" class="rct-btn" data-act="look" data-id="' + esc(p.id) + '" aria-expanded="' + !!openRows[p.id] + '">' + (openRows[p.id] ? 'Hide' : 'Look') + '</button></div>' +
      (openRows[p.id] ? detailHtml(p) : '') + '</article>';
  }
  // Kate, 16 Nov 2026 (ate Jho's steps for the support roles): Trade test (4 to 5 hours, on a busy day, about twice a week), then Good or Not good, then the Offer letter and the starting date.
  function fdate(d) { try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(d).slice(0, 10) + 'T12:00:00')); } catch (e) { return ''; } }
  function stageSub(p) {
    var l = STAGE_LABEL[p.stage] || '';
    if (p.stage === 'trade_test' && p.stage_note) return l + ': ' + p.stage_note;
    if ((p.stage === 'start_pending' || p.stage === 'start_accepted' || p.stage === 'hired') && p.start_date) return l + ', starts ' + fdate(p.start_date);
    return l;
  }
  function row(p) {
    var why = flags(p).map(function (f) { return f.t; }).join(' and ');
    var sub = p.stage === 'new' ? (why || (p.role_txt || '')) :
              p.stage === 'screening' ? (lineOpenRole(p) ? 'Shortlisted ' + fat(p.decided_at) + (byWho(p) ? ' by ' + byWho(p) : '') + ', interview with the coordinators next' : 'Invite sent ' + fat(p.decided_at) + (byWho(p) ? ' by ' + byWho(p) : '') + ', not booked yet') :
              p.stage === 'interview_booked' ? 'Interview booked, moved ' + fat(p.decided_at) + (byWho(p) ? ' by ' + byWho(p) : '') :
              p.stage === 'not_now' || p.stage === 'rejected' ? (STAGE_LABEL[p.stage] + ' ' + fat(p.decided_at) + (byWho(p) ? ' by ' + byWho(p) : '')) : stageSub(p) + (byLine(p) ? ' (' + byLine(p) + ')' : '');
    var acts = '', lookBtn = '<button type="button" class="rct-btn rct-sm" data-act="look" data-id="' + esc(p.id) + '" aria-expanded="' + !!openRows[p.id] + '">' + (openRows[p.id] ? 'Hide' : 'Look') + '</button>';
    if (usesPipe(p)) acts = lookBtn + pipeActs(p);
    else if (p.stage === 'new') acts = lookBtn + (bucket(p) === 'no' ? '<button type="button" class="rct-btn rct-sm" data-act="bk" data-to="look" data-id="' + esc(p.id) + '">Worth a look</button>' : '') + '<button type="button" class="rct-btn rct-sm" data-act="short" data-id="' + esc(p.id) + '">Shortlist</button>' +
                                  '<button type="button" class="rct-btn rct-sm" data-act="no" data-id="' + esc(p.id) + '">No</button>';
    else if (p.stage === 'screening') acts = statusSelect(p) + '<button type="button" class="rct-btn rct-sm" data-act="booked" data-id="' + esc(p.id) + '">Interview booked</button><button type="button" class="rct-btn rct-sm" data-act="short" data-id="' + esc(p.id) + '">Invite again</button>' + '<button type="button" class="rct-btn rct-sm rct-pri" data-act="passed" data-id="' + esc(p.id) + '">Passed</button><button type="button" class="rct-btn rct-sm" data-act="no" data-id="' + esc(p.id) + '">No</button>';
    else if (p.stage === 'interview_booked') acts = statusSelect(p) + '<button type="button" class="rct-btn rct-sm rct-pri" data-act="passed" data-id="' + esc(p.id) + '">Passed</button><button type="button" class="rct-btn rct-sm" data-act="no" data-id="' + esc(p.id) + '">No</button>';
    else if (p.stage === 'trade_test') acts = '<button type="button" class="rct-btn rct-sm rct-pri" data-act="ttgood" data-id="' + esc(p.id) + '">Trade test good</button><button type="button" class="rct-btn rct-sm" data-act="ttbad" data-id="' + esc(p.id) + '">Not good</button>';
    else if (p.stage === 'offer') acts = '<button type="button" class="rct-btn rct-sm rct-pri" data-act="hire" data-id="' + esc(p.id) + '">Set starting date</button>';
    else if (p.stage === 'not_now' || p.stage === 'rejected') acts = statusSelect(p) + '<button type="button" class="rct-btn rct-sm" data-act="reply" data-id="' + esc(p.id) + '">Reply</button><button type="button" class="rct-btn rct-sm" data-act="back" data-id="' + esc(p.id) + '">Put back</button>';
    var det = [p.emirate || p.country, p.experience, p.role_txt].filter(Boolean).map(esc).join(' &middot; ');
    return '<div class="rct-row">' + avatar(p) + '<div class="rct-who"><b>' + esc(p.name || 'Name not stated') + '</b>' +
      (det ? '<span>' + det + '</span>' : '') + '<span>' + esc(sub) + '</span></div>' +
      '<div class="rct-acts">' + waitPill(p) + extraPills(p) + stagePill(p) + acts + '</div>' + (openRows[p.id] ? detailHtml(p) : '') + '</div>';
  }
  var GROUPS = ['hand', 'abroad', 'noph', 'badph', 'nocv', 'noig', 'role'].map(function (k) { return [k, FLAG_NAME[k]]; });
  function noGroups() {
    var g = { hand: [], abroad: [], noph: [], badph: [], nocv: [], noig: [], role: [] };
    by('no').forEach(function (p) { g[flags(p)[0].k].push(p); });
    return g;
  }
  function fig(key, n, label, cls, sub) {
    // Kate, 17 Nov 2026 ("unclickable pls fix"): Total applications is the box that is lit while no other box is picked, so it looks and feels like the others; pressing it brings everyone back.
    var on = key === 'all' ? !S.lane : S.lane === key;
    return '<button type="button" class="rct-fig ' + (cls || '') + (on ? ' rct-sel' : '') + '" data-fig="' + key + '" aria-pressed="' + on + '"><span class="rct-n">' + n + '</span><span class="rct-l">' + label + (sub ? '<small class="rct-since">' + sub + '</small>' : '') + '</span></button>';
  }


  // Kate, 19 Nov 2026 ("may applicant ba tayo Sepora ang name... ang hirap pala nung exact match"): Find someone now also shows close spellings, not only exact text.
  // Names reach us spelled many ways (Sepora, Zipporah, Seporah), so each word typed is also matched by how it SOUNDS (ph = f, z = s, c = k, e = i, o = u, silent h, double letters)
  // and by one or two letters off. Exact matches are always kept; close ones are added and named in a line above the results so nobody is surprised.
  function fold(s) { s = String(s == null ? '' : s).toLowerCase(); try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* old browser */ } return s; }
  function sound(w) {
    return fold(w).replace(/[^a-z0-9]/g, '').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c([ei])/g, 's$1').replace(/[cq]/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's')
      .replace(/[yj]/g, 'i').replace(/h$/, '').replace(/([aeiou])h/g, '$1').replace(/e/g, 'i').replace(/o/g, 'u').replace(/(.)\1+/g, '$1');
  }
  function editDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i], lo = i; for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)); if (cur[j] < lo) lo = cur[j]; }
      if (lo > max) return max + 1; prev = cur;
    }
    return prev[b.length];
  }
  function nameWords(p) { return fold([p.name, String(p.email || '').split('@')[0]].join(' ')).split(/[^a-z0-9]+/).filter(Boolean); }
  // 0 = no match, 1 = exact (the old rule), 2 = close spelling
  function findHit(p, t) {
    if (!t) return 1;
    if ([p.name, p.email, p.whatsapp, p.country, p.emirate].join(' ').toLowerCase().indexOf(t) >= 0) return 1;
    var words = fold(t).split(/[^a-z0-9]+/).filter(Boolean); if (!words.length) return 0;
    var nk = p.id + '|' + p.name + '|' + p.email, hw = NWC[nk] || (NWC[nk] = nameWords(p).map(function (w) { return [w, sound(w)]; })), exact = fold([p.name, p.email, p.whatsapp, p.country, p.emirate].join(' '));
    var allSnd = hw.map(function (x) { return x[1]; }).join('');
    return words.every(function (w) {
      if (exact.indexOf(w) >= 0) return true;
      if (w.length < 4 || /\d/.test(w)) return false;
      var sw = sound(w), max = sw.length >= 7 ? 2 : 1;
      if (sw.length >= 4 && allSnd.indexOf(sw) >= 0) return true;
      return hw.some(function (x) { return x[1] === sw || (sw.length >= 4 && x[1].indexOf(sw) === 0) || editDist(sw, x[1], max) <= max; });
    }) ? 2 : 0;
  }
  var closeNames = [], NWC = {};
  function nearLine() { return closeNames.length ? 'Also showing close spellings: ' + closeNames.slice(0, 6).map(esc).join(', ') + (closeNames.length > 6 ? ' and ' + (closeNames.length - 6) + ' more' : '') + '.' : ''; }

  function found() {
    var t = q.trim().toLowerCase(), hit = {};
    var out = rows.filter(function (p) { hit[p.id] = findHit(p, t); return hit[p.id] > 0; })
      .sort(function (a, c) { return (hit[a.id] - hit[c.id]) || (new Date(c.applied_at) - new Date(a.applied_at)); });
    closeNames = out.filter(function (p) { return hit[p.id] === 2; }).map(function (p) { return p.name; });
    return out;
  }

  // Kate, 11 Nov 2026: the Look panel is as wide as the visible table so it stays put when the table is scrolled right (see .rct-dtlin in the css)
  function fitDetail() { var bx = document.getElementById('rctTbox'); if (bx) bx.style.setProperty('--rct-vw', bx.clientWidth + 'px'); }
  window.addEventListener('resize', fitDetail);
  function render() {
    var el = main(); if (!el) return;
    ddClose();
    saveView(); urlSync();
    var h = '<div class="rct">';
    h += '<h2>Recruitment</h2><p class="rct-lead">Who is worth Emma’s time today, and who is still waiting for an answer.</p>';
    h += '<div class="rct-pills rct-top"><span class="rct-pill rct-grey">Checked every 5 minutes from the two inboxes</span></div>';
    if (loadErr) { el.innerHTML = h + '<p class="rct-warn">' + esc(loadErr) + '</p></div>'; return; }
    if (!C) { el.innerHTML = h + '<p class="slv-muted">Loading.</p></div>'; return; }
    // Kate, 16 Nov 2026: this notice sits right under "Checked every 5 minutes" and is a thin strip, not a tall box.
    if (!setting('booking_link', '') || !setting('templates_confirmed', false)) {
      h += '<p class="rct-note rct-amberbox rct-slim">' + (!setting('booking_link', '') ? 'The booking link is not set yet. ' : '') +
           (!setting('templates_confirmed', false) ? 'The invite reply is still placeholder text until you save your own. ' : '') +
           '<button type="button" class="rct-linkbtn" data-act="settings">Set them now</button></p>';
    }

    var look = by('look'), no = by('no'), late = lateList(), inv = by('invited'), bk = by('booked');
    // Kate, 17 Nov 2026 ("walang total applications. binilang ko 407"): a sixth box with the total, first in the row. It counts everyone on the list (Not now and Hired included, Test rows and Not an applicant left out); clicking it shows everyone.
    var total = rows.length;   // the same people the list counts ("Showing 407 of 407"), so the box and the line under it always agree
    h += '<div class="rct-figs">' +
      fig('all', total, 'Total applications', '', rows.length ? 'since ' + fdate(rows.reduce(function (m, p) { return p.applied_at && p.applied_at < m ? p.applied_at : m; }, rows[0].applied_at)) : '') +
      fig('look', look.length, 'Worth a look, need your yes or no', 'rct-main') +
      fig('no', no.length, 'Probably no, flagged for you') +
      fig('late', late.length, 'Waiting ' + waitDays() + ' days or more with no reply', late.length ? 'rct-warnfig' : '') +
      fig('invited', inv.length, 'Invited, not booked yet') +
      fig('booked', bk.length, 'Interview booked') + '</div>';

    // Kate, 16 Nov 2026 ("ipag kasya mo to sa taas kasama nung isa pang search bar"): the hiring roles box is one slim field beside the Find someone search, not a box of its own.
    // The explanation that used to sit under it is the field's tooltip.
    h += '<div class="rct-fields"><label class="rct-find"><span class="rct-sr">Find someone</span><input type="search" id="rctFind" placeholder="Find someone by name, email or country" value="' + esc(q) + '" autocomplete="off"></label>' +
         '<label class="rct-find rct-hiring" title="Type what is needed and press Enter. Anyone applying for a role that is not in this list moves to Probably no. Leave it empty and nobody is moved because of their role."><span class="rct-hl">Hiring now</span>' +
         '<input type="text" id="rctRoles" class="rct-rolein" value="' + esc(openText()) + '" placeholder="Roles, separated by commas, then Enter. For example Hair stylist, Receptionist" autocomplete="off" aria-label="What we are hiring for right now. Anyone applying for a role not in this list moves to Probably no."></label></div>' + (setBy('open_roles_text') ? '<p class="rct-hint rct-hiringby">Hiring now: ' + esc(setBy('open_roles_text').replace(/^Last/, 'last')) + '</p>' : '');
    h += '<div class="rct-bar">' +
         segHtml() + '<button type="button" class="rct-btn rct-sm rct-pri" data-act="addperson">Add person</button><button type="button" class="rct-btn rct-sm" data-act="photobulk">Add photos</button><button type="button" class="rct-btn rct-sm" data-act="settings">Booking link and replies</button><button type="button" class="rct-btn rct-sm" data-act="emails">Email formats</button>' + (typeof rexButtons === 'function' ? rexButtons('rctExport') : '') + '</div>';

    if (S.lane) h += laneBarHtml();
    if (S.mode === 'list') {
      var bxOld = document.getElementById('rctTbox'), keepPos = bxOld ? [bxOld.scrollTop, bxOld.scrollLeft] : null;
      h += renderList() + goneHtml() + '<p class="rct-hint">Grid or List is remembered for you on this browser. Press V to switch. Stage names are the TRS Recruitment labels already in the inboxes. Apart from the automatic shortlist email for support roles, the dashboard never sends email. Waiting counts days since the application with no human reply.</p>';
      el.innerHTML = h + '</div>' + bulkBarHtml();
      var bxNew = document.getElementById('rctTbox'); if (bxNew && keepPos) { bxNew.scrollTop = keepPos[0]; bxNew.scrollLeft = keepPos[1]; }
      fitDetail();
      return;
    }
    if (q.trim().length >= 2) {
      var f = found();
      h += '<section class="rct-sec"><div class="rct-sech"><h2>Found<span class="rct-cnt">' + f.length + '</span></h2></div>' + (closeNames.length ? '<p class="rct-hint">' + nearLine() + '</p>' : '') +
        (f.length ? '<div class="rct-card rct-list">' + f.slice(0, 40).map(row).join('') + (f.length > 40 ? '<p class="rct-hint">Showing the first 40. Type more to narrow it.</p>' : '') + '</div>' : '<div class="rct-empty">Nobody matches that.</div>') + '</section>';
      el.innerHTML = h + '</div>'; return;
    }

    if (S.lane === 'late') h += lateSectionHtml(late);
    if (!S.lane || S.lane === 'look') {
    h += '<section class="rct-sec"><div class="rct-sech"><h2>Worth a look<span class="rct-cnt">' + look.length + '</span></h2><span class="rct-hint">Longest waiting first. All checks passed.</span></div>';
    h += look.length ? '<div class="rct-cards">' + look.slice(0, shownLook).map(card).join('') + '</div>' +
      (look.length > shownLook ? '<button type="button" class="rct-btn rct-sm rct-more" data-act="morelook">Show ' + Math.min(PAGE, look.length - shownLook) + ' more (' + (look.length - shownLook) + ' left)</button>' : '')
      : '<div class="rct-empty">Nobody waiting for your decision. The next application will appear here.</div>';
    h += '</section>';
    }

    if (!S.lane || S.lane === 'no') {
    h += '<section class="rct-sec"><div class="rct-sech"><h2>Probably no<span class="rct-cnt">' + no.length + '</span></h2><span class="rct-hint">Opened by reason. Open a person with Look. The No for a whole group only covers people you have looked at.</span></div>';
    var g = noGroups(), openG = {};
    var cur = el.querySelectorAll('details.rct-grp[open]'); for (var i = 0; i < cur.length; i++) openG[cur[i].getAttribute('data-g')] = true;
    GROUPS.forEach(function (gr) {
      var list = g[gr[0]]; if (!list.length) return;
      var n = shownNo[gr[0]] || PAGE;
      h += '<details class="rct-grp" data-g="' + gr[0] + '"' + (openG[gr[0]] ? ' open' : '') + '><summary><span>' + gr[1] + '<span class="rct-cnt">' + list.length + '</span></span></summary><div class="rct-dbody">' +
        '<div class="rct-bulk"><span>' + list.filter(isReviewed).length + ' of ' + list.length + ' looked at so far. The No for the group covers those.</span><button type="button" class="rct-btn rct-sm rct-danger" data-act="bulk" data-g="' + gr[0] + '">No for the group</button></div>' +
        list.slice(0, n).map(row).join('') +
        (list.length > n ? '<button type="button" class="rct-btn rct-sm rct-more" data-act="moreno" data-g="' + gr[0] + '">Show ' + Math.min(PAGE, list.length - n) + ' more (' + (list.length - n) + ' left)</button>' : '') +
        '</div></details>';
    });
    if (!no.length) h += '<div class="rct-empty">Nothing flagged right now.</div>';
    h += '</section>';
    }

    var prog = rows.filter(function (p) { var b = bucket(p); return !p.is_test && (b === 'invited' || b === 'booked' || b === 'later') && (!S.lane || b === S.lane); });
    if (!S.lane || S.lane === 'invited' || S.lane === 'booked') {
    h += '<section class="rct-sec"><div class="rct-sech"><h2>In progress<span class="rct-cnt">' + prog.length + '</span></h2></div><div class="rct-card rct-list">' +
      (prog.length ? prog.map(row).join('') : '<p class="rct-hint">No one yet.</p>') + '</div></section>';
    }

    if (!S.lane) {
    var done = rows.filter(function (p) { return !p.is_test && bucket(p) === 'done'; }).sort(function (a, c) { return new Date(c.decided_at || 0) - new Date(a.decided_at || 0); });
    h += '<details class="rct-grp rct-donebox" data-g="done"><summary><span>Not now<span class="rct-cnt">' + done.length + '</span></span></summary><div class="rct-dbody">' +
      (done.length ? done.slice(0, 30).map(row).join('') + (done.length > 30 ? '<p class="rct-hint">Showing the latest 30.</p>' : '') : '<p class="rct-hint">No one yet.</p>') + '</div></details>';
    }
    h += goneHtml() + '<p class="rct-note">Stage names are the TRS Recruitment labels already in the inboxes. Apart from the automatic shortlist email for support roles, the dashboard never sends email: Shortlist gives you the reply to send from the recruitment inbox. Waiting counts days since the application with no human reply; the automatic brochure email does not count.</p>';
    el.innerHTML = h + '</div>';
    if (q) { var inp = document.getElementById('rctFind'); if (inp && document.activeElement !== inp && inp.__keep) inp.focus(); }
  }

  /* ---------- Grid or List ---------- */
  // Kate, 9 Nov 2026 (mockup approved: docs/mockups/recruitment-list.html in the cowork repo). Grid is the card layout; List is a table with a sticky header, a filter
  // on every column header (sort, search, value checklist, clear) and the photo and name columns frozen on the left like Google Sheets. The five tiles filter BOTH
  // views. The chosen view is remembered in this browser (localStorage trs-rct-layout, the dashboard's trs-* pattern); V switches.
  var LKEY = 'trs-rct-layout';
  var S = { mode: 'grid', lane: null, filters: {}, sort: { col: 'wait', dir: 'desc' }, showDone: false, pageSize: 10, page: 0, pgSig: '' };
  try { var savedMode = localStorage.getItem(LKEY); if (savedMode === 'list' || savedMode === 'grid') S.mode = savedMode; } catch (e) { /* private window */ }
  var PKEY = 'trs-rct-pagesize', SIZES = [10, 20, 50, 100];
  try { var savedSize = parseInt(localStorage.getItem(PKEY), 10); if (SIZES.indexOf(savedSize) >= 0) S.pageSize = savedSize; } catch (e) { /* private window */ }
  function savePageSize(n) { try { localStorage.setItem(PKEY, String(n)); } catch (e) { /* private window */ } }
  function saveMode(m) { try { localStorage.setItem(LKEY, m); } catch (e) { /* private window */ } }
  var LANE_NAME = { look: 'Worth a look', no: 'Probably no', late: 'Waiting 14 days or more', invited: 'Invited, not booked yet', booked: 'Interview booked' };
  var EXP_ORDER = ['1 to 3 years', '3 to 5 years', '5 to 10 years', '10 to 15 years', '15 plus years'];
  var ICON_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  var ICON_GRID = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>';
  var ICON_FILTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>';

  function laneOk(p) {
    // Kate, 19 Nov 2026 (Sepora was in Not now, so Find someone showed nobody): while a search is typed, Not now people are searched too and the count says so.
    if (!S.lane) return bucket(p) !== 'done' || S.showDone || q.trim().length >= 2;
    if (S.lane === 'late') return isLate(p);
    return bucket(p) === S.lane;
  }
  // a photo or, until there is one, the initials (rounded square, never a circle)
  function initials(n) { var s = String(n || '').trim().split(/\s+/).filter(Boolean); return s.length ? (s[0].charAt(0) + (s[1] ? s[1].charAt(0) : '')).toUpperCase() : '?'; }
  // Kate, 10 Nov 2026: the avatar is the photo (rounded square, never a circle) or the initials; click it, or drop an image on it, to add or change the photo.
  var PHOTO = {};   // storage path -> short-lived signed link, filled by loadPhotoUrls()
  function avatar(p, big) {
    var url = p.photo && PHOTO[p.photo];
    return '<button type="button" class="rct-av' + (big ? ' rct-avlg' : '') + (url ? ' rct-hasimg' : '') + '" data-act="photo" data-id="' + esc(p.id) + '" title="' + (p.photo ? 'Change photo' : 'Add a photo') + ' (click, or point here and press Ctrl+V to paste a copied image)" aria-label="' + (p.photo ? 'Change the photo of ' : 'Add a photo for ') + esc(p.name || 'this person') + '">' +
      (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" draggable="false">' : esc(initials(p.name))) + '</button>';
  }
  function placeShort(p) {
    var c = String(p.country || '').trim(); if (/emirates|^uae$/i.test(c)) c = 'UAE';
    var bits = [p.emirate, c].filter(Boolean); return bits.length ? bits.join(', ') : 'Not stated';
  }
  // the filter lists work on short groups (a handful of values), the cells show the longer wording
  function countryShort(p) {
    var c = String(p.country || '').trim();
    if (/emirates|^uae$/i.test(c) || (!c && p.emirate)) return 'UAE';
    return c || 'Not stated';
  }
  function expNum(p) { var m = /(\d+)/.exec(String(p.experience || '')); return m ? +m[1] : 999; }   // "5 to 10 years" sorts as 5, "7 years" as 7, blank last
  // Kate, 11 Nov 2026: "Applying for" shows a few fixed values, not what the person typed (change the words here only):
  //   Hair Assistant (says so in the subject, role or what they wrote), then the role the mailbox script read (hair roles = Hairdresser / Hair Stylist, beauty and nails = Beautician,
  //   front desk), and for "other" the first hair or beauty word in what they wrote; no clue at all is Not stated.
  var ROLE_FIXED = { stylist: 'Hairdresser / Hair Stylist', colourist: 'Hairdresser / Hair Stylist', barber: 'Hairdresser / Hair Stylist', braider: 'Hairdresser / Hair Stylist',
                     beauty: 'Beautician', nails: 'Beautician', front: 'Front Desk / Reception' };
  var HAIR_ASSIST = /(hair\s*dresser|hairdresser|hair|salon)\s*(and\s*)?assistant|assistant\s*(hair\s*dresser|hairdresser|hair\b|stylist)|\bhair\s*assist/i;
  var HAIR_WORD = /hair|stylist|barber|braid|colou?rist|colou?r\s*specialist|balayage|keratin|wig|coiffeu|parrucchier|peluquer|barbier|مصفف|حلاق|تصفيف|парикмахер|стилист|барбер/i,
      BEAUTY_WORD = /beaut|nail|manicur|pedicur|lash|make-?up|henna|facial|skin|massage|\bwax|threading|therapist|esthetic|aesthetic|maquill|esthéti|manucure|ongle|estetist|unghie|مكياج|تجميل|اظافر|أظافر|بشرة|маникюр|косметолог/i;
  // Kate, 11 Nov 2026 (second pass, Serge Allaverdian: "she's not a beautician, she's a hair colourist"): what the person WROTE decides first, because the mailbox script's own role
  // guess puts "beauty" ahead of "stylist" and caught a handle like beauty_glam_dxb. The path they ticked ("The Employed Stylist") is taken out of the text first, it says nothing about the
  // trade. Hair Assistant wins, then front desk, then whichever of the hair or the beauty words comes FIRST in what they wrote; the script's role_key is only the fallback.
  var PATH_WORDS = /Path (One|Two|Three):\s*(The (Employed|Flexible) Stylist|Rent-a-Chair)|Not sure yet\s*I would like to explore the options/gi;
  var REC_WORD = /receptionist|front\s*(desk|off+ice)|call\s*cent/i;
  // the CV's own file name often says it ("Youssef_Ehab_Hairstylist_CV.pdf"): the stored attachment's name, else the file name at the end of the CV link
  function cvFileName(p) {
    var n = p.cv_file_name || ''; if (n) return n;
    var m = /([^\/?#]+\.(?:pdf|docx?|jpe?g|png|webp))(?:[?#].*)?$/i.exec(String(p.cv_link || ''));
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  // Kate, 11 Nov 2026: "kung di mo ma determine ako na lang mag set": the dropdown in the Applying for cell sets it by hand (role_override), whatever the text says.
  // Kate, 16 Nov 2026: Admin added (Supriya Gonsalves, Admin/Manager); Manager and Make Up Artist added the same day (the database function recruit_set_role accepts the same words).
  var ROLE_CHOICES = ['Hairdresser / Hair Stylist', 'Hair Assistant', 'Beautician', 'Make Up Artist', 'Front Desk / Reception', 'Manager', 'Admin', 'Other'];
  var MUA_WORD = /make-?\s*up\s*artist|\bmua\b|مكياج/i, MGR_WORD = /\bmanager\b|\bmanageress\b/i;
  function roleGroup(p) {
    if (p.role_set) return p.role_set;
    var t = [p.role_txt, p.specialist, String(p.about || ''), cvFileName(p).replace(/[_.]+/g, ' ')].join(' ').replace(PATH_WORDS, ' ');
    if (HAIR_ASSIST.test(t)) return 'Hair Assistant';
    // whichever of reception, hair or beauty words comes first in what they wrote (a hair person's "receptionist" never beats "hairstylist" and the other way round)
    var r = t.search(REC_WORD), h = t.search(HAIR_WORD), b = t.search(BEAUTY_WORD), first = -1, g = '';
    // Make Up Artist and Manager are only read from what they say they apply for (role and specialist), so a stylist's "I managed a salon" in the story does not move them
    var ra = [p.role_txt, p.specialist].join(' ').replace(PATH_WORDS, ' ');
    if (MUA_WORD.test(ra)) return 'Make Up Artist';
    if (MGR_WORD.test(ra) && ra.search(MGR_WORD) <= Math.min.apply(null, [ra.search(HAIR_WORD), ra.search(BEAUTY_WORD)].filter(function (x) { return x >= 0; }).concat([1e9]))) return 'Manager';
    [[r, 'Front Desk / Reception'], [h, 'Hairdresser / Hair Stylist'], [b, 'Beautician']].forEach(function (x) { if (x[0] >= 0 && (first < 0 || x[0] < first)) { first = x[0]; g = x[1]; } });
    return g || ROLE_FIXED[p.role_key] || 'Not stated';
  }
  // Kate, 11 Nov 2026: the employment type they are interested in, from the path(s) ticked on the form. More than one path shows as "A + B"; no path (a direct email) is Not stated.
  function autoRole(p) { var was = p.role_set; p.role_set = null; var g = roleGroup(p); p.role_set = was; return g; }
  function roleSelect(p) { return lazyDD('rs', p); }
  async function setRole(id, to) {
    var p = personById(id); if (!p) return;
    try {
      var r = await rpcEdit('recruit_set_role', { p_id: p.id, p_to: to === 'auto' ? null : to }); if (r.error) throw new Error(r.error.message);
      p.role_set = to === 'auto' ? null : to; render(); toast(to === 'auto' ? firstName(p.name) + ': back to automatic.' : firstName(p.name) + ' is set to ' + to + '.');
    } catch (e) { console.error(e); render(); toast('That did not save: ' + (e.message || 'try again')); }
  }
  // Kate, 16 Nov 2026: "allow me to be able to edit name". A pencil next to the name opens a small box; the typed name is locked in the database (recruit_set_name), so the next mailbox
  // import cannot put the old one back. An empty box clears it and lets the imported name return.
  function renameDialog(id) {
    var p = personById(id); if (!p) return;
    openDlg('Edit name',
      '<label class="rct-field"><span>Name</span><input type="text" id="rctNameIn" maxlength="120" autocomplete="off" value="' + esc(p.name || '') + '"></label>' +
      '<p class="rct-hint">Saved names are kept, a new email from the same person will not change them. Leave it empty to go back to the name in the email.</p>' +
      '<p class="rct-amberbox" id="rctNameSay" hidden></p>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="renamesave" data-id="' + esc(p.id) + '">Save name</button><button type="button" class="rct-btn" data-close>Cancel</button></div>');
    var i = document.getElementById('rctNameIn'); if (i) { i.focus(); i.select(); }
  }
  async function renameSave(id) {
    var p = personById(id), inp = document.getElementById('rctNameIn'), say = document.getElementById('rctNameSay'); if (!p || !inp) return;
    var v = inp.value.replace(/\s+/g, ' ').trim();
    try {
      var r = await rpcEdit('recruit_set_name', { p_id: p.id, p_name: v }); if (r.error) throw new Error(r.error.message);
    } catch (e) { console.error(e); if (say) { say.hidden = false; say.textContent = 'That did not save: ' + (e.message || 'try again'); } return; }
    p.name = v || p.name; closeDlg(); render(); toast(v ? 'Name saved: ' + v + '.' : 'Cleared. The name from the email comes back with the next sync.');
  }
  function empType(p) {
    var s = [p.paths, p.role_txt].join(' '), n = [];
    if (/Path One/i.test(s)) n.push('Employed');
    if (/Path Two/i.test(s)) n.push('Flexible');
    if (/Path Three/i.test(s)) n.push('Rent-a-chair');
    if (/Not sure yet/i.test(s)) n.push('Not sure yet');
    return n.length ? n.join(' + ') : 'Not stated';
  }
  function statusText(p) {
    var b = bucket(p);
    if (b === 'look') return p.look_ok && flags(p).length ? 'Worth a look (by hand)' : 'Worth a look';
    if (b === 'no') return 'Probably no: ' + FLAG_SHORT[flags(p)[0].k];
    return STAGE_LABEL[p.stage] || p.stage;
  }
  function waitBucket(p) {
    if (p.stage !== 'new') return 'Not waiting';
    if (p.replied_at) return 'We replied';
    var d = waited(p); return d >= 21 ? '21 days or more' : d >= 14 ? '14 to 20 days' : d >= 7 ? '7 to 13 days' : 'Under 7 days';
  }
  // Kate, 10 Nov 2026: a CV column. The CV link opens the original; people without one show as No CV (a form asks for one, a direct email may carry it as an attachment).
  // Kate, 11 Nov 2026: a Profile photo column so the people with a photo can be filtered from the ones without (the first column only shows the picture or initials).
  function photoLabel(p) { return !p.photo ? 'No photo' : p.photo_bad ? 'Photo not professional' : 'Has photo'; }
  // Kate, 11 Nov 2026: a direct email carries its CV as an attached file, so there is no file link, and Coach Emma has no access to info@ to open the email, so the page does not
  // link into Gmail. It says "In the email" (not clickable) until the attachments are stored on the dashboard.
  // Kate, 16 Nov 2026: "In the email" was wrong for people who attached nothing (Osas, Panagiotis, Shawn, Ahmad all wrote "I can send my CV" or forgot it). The script looks at a new
  // email every 5 minutes, so only the first 2 hours can still be waiting; after that no stored file means no CV came, and it says No CV.
  function inEmail(p) { return p.source === 'email' && !cvUrl(p) && !deadCv(p) && !p.cv_file && (Date.now() - new Date(p.applied_at).getTime()) < 2 * 3600 * 1000; }
  function cvLabel(p) { return cvUrl(p) || p.cv_file ? 'Has CV' : deadCv(p) ? 'CV link broken' : inEmail(p) ? 'CV in the email' : 'No CV'; }
  var CV_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="#9aa0b4" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5M9 13h6M9 17h6" fill="none" stroke="#9aa0b4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Kate, 17 Nov 2026 ("we also have cvs na need i download (word document). can u indicate that in there like an arrow down symbol"): a Word CV (a link or a stored file ending .doc or .docx) cannot be
  // read in the browser, it downloads to the computer, so it shows a down arrow instead of the page icon, and the title says so.
  function cvIsWord(p) {
    var u = cvUrl(p);
    if (u) return /\.docx?$/i.test(u.split(/[?#]/)[0]);
    return !!p.cv_file && /\.docx?$/i.test(String(p.cv_file_name || p.cv_file || ''));
  }
  var CV_WORD_TIP = 'Word document: it downloads to your computer';
  var DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" fill="none" stroke="#9aa0b4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function igLabel(p) { var k = linkKind(p); return k ? linkName(p) : (p.source === 'form' ? 'None given' : 'Not stated'); }
  // Kate, 10 Nov 2026: which inbox the application arrived in (a person who wrote to both shows as Both)
  function srcLabel(p) { if (p.source === 'manual') return 'Added by hand'; var m = p.mailboxes || [], i = m.indexOf('info') >= 0, r = m.indexOf('recruitment') >= 0; return i && r ? 'Both inboxes' : i ? 'info@' : r ? 'recruitment@' : 'Not stated'; }
  function monthOf(p) { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', month: 'long', year: 'numeric' }).format(new Date(p.applied_at)); } catch (e) { return ''; } }

  var COLS = [
    // Kate, 16 Nov 2026: Application Status is the first column (frozen, with the photo and name) so the next step is always in view.
    // Kate, 17 Nov 2026: "application status can also be filtered". The funnel filters by the step the person is at (the dropdown in the cell) and sorts by how far along they are.
    { k: 'acts', t: 'Application Status', val: function (p) { return STAGE_LABEL[p.stage] || p.stage; }, sort: function (p) { var i = STAGE_ORDER.indexOf(p.stage); return i < 0 ? 99 : i; }, kind: 'num', asc: 'Earliest step first', desc: 'Latest step first' },
    { k: 'av', t: '', nofilter: true },
    { k: 'name', t: 'Name', val: function (p) { return p.name || 'Name not stated'; }, sort: function (p) { return String(p.name || '').toLowerCase(); }, kind: 'text' },
    { k: 'photo', t: 'Profile photo', val: photoLabel, sort: function (p) { return !p.photo ? 2 : p.photo_bad ? 1 : 0; }, kind: 'num', asc: 'Good photo first', desc: 'No photo first' },
    // Kate, 17 Nov 2026 ("put applying for column after has profile photo column"): Applying for sits right after Profile photo.
    { k: 'role', t: 'Applying for', val: roleGroup, sort: function (p) { return roleGroup(p).toLowerCase(); }, kind: 'text' },
    { k: 'pref', t: 'Preferred location', val: prefLabel, sort: function (p) { return prefLabel(p).toLowerCase(); }, kind: 'text' },
    { k: 'place', t: 'Based in', val: countryShort, sort: function (p) { return placeShort(p).toLowerCase(); }, kind: 'text' },
    { k: 'ig', t: 'Link to work', val: igLabel, sort: function (p) { return (linkKind(p) ? '0' : '1') + igLabel(p).toLowerCase(); }, kind: 'text' },
    { k: 'cv', t: 'CV', val: cvLabel, sort: function (p) { return cvUrl(p) || p.cv_file ? 0 : inEmail(p) ? 1 : deadCv(p) ? 2 : 3; }, kind: 'text' },
    { k: 'exp', t: 'Experience', val: function (p) { return p.experience || 'Not stated'; }, sort: expNum, kind: 'num', asc: 'Fewest years first', desc: 'Most years first' },
    { k: 'emp', t: 'Employment type', val: empType, sort: function (p) { return empType(p).toLowerCase(); }, kind: 'text' },
    { k: 'applied', t: 'Applied', val: monthOf, sort: function (p) { return new Date(p.applied_at).getTime(); }, kind: 'num', asc: 'Oldest first', desc: 'Newest first' },
    { k: 'src', t: 'Came from', val: srcLabel, sort: function (p) { return srcLabel(p).toLowerCase(); }, kind: 'text' },
    { k: 'wait', t: 'Waiting', val: waitBucket, sort: function (p) { return (p.stage === 'new' && !p.replied_at) ? waited(p) : -1; }, kind: 'num', asc: 'Shortest wait first', desc: 'Longest wait first' },
    { k: 'status', t: 'Status', val: statusText, sort: function (p) { return statusText(p).toLowerCase(); }, kind: 'text' },
    // Kate, 17 Nov 2026: who made the last change on the person (ate Jho, ate Frances, Coach Emma, Kate) and what it was; filter by person, sort by latest.
    { k: 'asg', t: 'Assigned to', val: function (p) { return p.assigned_to ? firstName(p.assigned_to) : 'Nobody yet'; }, sort: function (p) { return p.assigned_to ? firstName(p.assigned_to).toLowerCase() : '~'; }, kind: 'text' },
    { k: 'edit', t: 'Last change', val: editedLabel, sort: function (p) { var e = lastEdit(p); return e ? new Date(e.at).getTime() : 0; }, kind: 'num', asc: 'Oldest change first', desc: 'Latest change first' }
  ];
  function colBy(k) { return COLS.filter(function (c) { return c.k === k; })[0]; }
  // Kate, 11 Nov 2026: the List remembers the column filters, the sort, the tile picked and Show/Hide Not now people in this browser (localStorage trs-rct-view, the dashboard's trs-*
  // pattern), so a refresh keeps them. Search text is not kept. Anything unreadable or naming a column that no longer exists is dropped. Clear all filters clears it too.
  var VKEY = 'trs-rct-view';
  function saveView() {
    try {
      var empty = !Object.keys(S.filters).length && !S.lane && !S.showDone && S.sort.col === 'wait' && S.sort.dir === 'desc';
      if (empty) localStorage.removeItem(VKEY); else localStorage.setItem(VKEY, JSON.stringify({ f: S.filters, s: S.sort, l: S.lane, d: !!S.showDone }));
    } catch (e) { /* private window */ }
  }
  (function loadView() {
    try {
      var v = JSON.parse(localStorage.getItem(VKEY) || 'null'); if (!v || typeof v !== 'object') return;
      if (v.f && typeof v.f === 'object') Object.keys(v.f).forEach(function (k) { var c = colBy(k), set = v.f[k]; if (c && !c.nofilter && set && typeof set === 'object') S.filters[k] = set; });
      if (v.s && colBy(v.s.col) && colBy(v.s.col).sort && (v.s.dir === 'asc' || v.s.dir === 'desc')) S.sort = { col: v.s.col, dir: v.s.dir };
      if (v.l && LANE_NAME[v.l]) S.lane = v.l;
      if (v.d === true) S.showDone = true;
    } catch (e) { /* unreadable, start clean */ }
  })();

  // Kate, 19 Nov 2026 ("if naka filter lang assigned to jho, will reflect, if assigned to frances lang will reflect din sa url, if both: assigned-to-frances+nobody"):
  // the address follows the filters. ?view=recruitment&assigned-to=frances+nobody&application-status=shortlisted&tile=look&sort=applied-desc
  // The parameter is the column's name as a slug, the values are the ticked values as slugs, + means "or". The tile and the sort ride along. A link that carries any of them
  // opens the page already filtered (in the List, where the column filters live) and wins over the view this browser remembers. index.html trSyncUrl writes rctUrlParts().
  function urlSlug(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function urlVal(col, v) { return col === 'asg' && v === 'Nobody yet' ? 'nobody' : urlSlug(v); }
  var URL_BY_NAME = {};
  COLS.forEach(function (c) { if (c.nofilter || !c.t) return; var n = urlSlug(c.t); if (n !== 'tile' && n !== 'sort' && n !== 'cand' && n !== 'view') URL_BY_NAME[n] = c.k; });
  var urlPending = null, urlCand = null, urlOpenCv = false, urlMiss = {};   // what the address brought: held until the rows are in (and the person to open, below)
  (function readUrl() {
    try {
      var q = new URLSearchParams(location.search), f = {}, keep = [], any = false, tile = q.get('tile'), sort = q.get('sort'), sv = null;
      urlCand = q.get('cand'); urlOpenCv = q.get('opencv') === '1';
      Object.keys(URL_BY_NAME).forEach(function (n) {
        var raw = q.get(n); if (raw === null) return;
        var vals = raw.split(/[\s+,]+/).filter(Boolean); if (!vals.length) return;
        f[URL_BY_NAME[n]] = vals; keep.push(n + '=' + vals.join('+')); any = true;
      });
      if (tile && LANE_NAME[tile]) { keep.push('tile=' + tile); any = true; } else tile = null;
      var m = sort && /^(.+)-(asc|desc)$/.exec(sort);
      if (m && URL_BY_NAME[m[1]] && colBy(URL_BY_NAME[m[1]]).sort) { sv = { col: URL_BY_NAME[m[1]], dir: m[2] }; keep.push('sort=' + sort); any = true; }
      if (any) urlPending = { filters: f, tile: tile, sort: sv, keep: keep };
    } catch (e) { /* the link is a convenience, never an error */ }
  })();
  // Once the rows are in: turn each slug back into the real value (so a value nobody has any more shows nobody, which is true), and open the List for column filters.
  function applyUrl() {
    var u = urlPending; if (!u) return; urlPending = null;
    S.lane = u.tile; S.filters = {}; urlMiss = {};
    Object.keys(u.filters).forEach(function (k) {
      var c = colBy(k), seen = {}, set = {}, hit = false;
      rows.forEach(function (p) { seen[c.val(p)] = true; });
      Object.keys(seen).forEach(function (v) { set[v] = u.filters[k].indexOf(urlVal(k, v)) >= 0; if (set[v]) hit = true; });
      S.filters[k] = set;
      if (!hit) urlMiss[k] = u.filters[k];   // nobody has that value: the page shows nobody, and the address keeps saying what was asked
    });
    // a link names the whole view: whatever this browser remembered (sort, Not now shown) does not leak into it
    S.sort = u.sort || { col: 'wait', dir: 'desc' }; S.showDone = false;
    if (Object.keys(u.filters).length) S.mode = 'list';
    var st = u.filters.acts || []; if (st.indexOf('not-now') >= 0 || st.indexOf('rejected') >= 0) S.showDone = true;   // those people are hidden unless Not now is shown
  }
  window.rctUrlParts = function () {
    if (urlPending) return urlPending.keep.slice();   // the rows are not in yet: say back what the link said
    var parts = [];
    if (S.lane) parts.push('tile=' + S.lane);
    COLS.forEach(function (c) {
      var set = S.filters[c.k]; if (!set || c.nofilter || !c.t) return;
      var on = Object.keys(set).filter(function (v) { return set[v]; }).map(function (v) { return urlVal(c.k, v); }).filter(Boolean);
      if (on.length) delete urlMiss[c.k];   // the person has ticked something real: the asked-for value no longer applies
      if (!on.length && urlMiss[c.k]) on = urlMiss[c.k];
      if (on.length) parts.push(urlSlug(c.t) + '=' + on.join('+'));
    });
    if (!(S.sort.col === 'wait' && S.sort.dir === 'desc') && colBy(S.sort.col)) parts.push('sort=' + urlSlug(colBy(S.sort.col).t) + '-' + S.sort.dir);
    return parts;
  };
  function urlSync() { try { if (typeof trSyncUrl === 'function' && typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'recruitment') trSyncUrl(null); } catch (e) { /* fine without it */ } }

  function listRows(ignoreCol) {
    var t = q.trim().toLowerCase(), near = [];
    if (!ignoreCol) closeNames = near;
    return rows.filter(function (p) {
      if (!laneOk(p)) return false;
      if (t.length >= 2) { var h = findHit(p, t); if (!h) return false; if (h === 2 && !ignoreCol) near.push(p.name); }
      for (var k in S.filters) { if (k === ignoreCol) continue; var set = S.filters[k]; if (set && !set[colBy(k).val(p)]) return false; }
      return true;
    });
  }
  function sortedRows(list) {
    var c = colBy(S.sort.col); if (!c || !c.sort) return list;
    var dir = S.sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) { var x = c.sort(a), y = c.sort(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || (new Date(a.applied_at) - new Date(b.applied_at)); });
  }
  function cellBtn(txt, col, val) { return '<button type="button" class="rct-cellbtn" data-cf="' + col + '" data-cv="' + esc(val) + '">' + txt + '</button>'; }
  function cell(c, p) {
    switch (c.k) {
      case 'av': return '<td class="rct-c-av"><label class="rct-selbox" title="Select for bulk actions"><input type="checkbox" data-sel="' + esc(p.id) + '"' + (SEL[p.id] ? ' checked' : '') + ' aria-label="Select ' + esc(p.name || 'this person') + '"></label>' + avatar(p) + '</td>';
      case 'name': return '<td class="rct-c-name"><button type="button" class="rct-cellbtn" data-act="look" data-id="' + esc(p.id) + '" aria-expanded="' + !!openRows[p.id] + '"><b>' + esc(p.name || 'Name not stated') + '</b></button>' + '<button type="button" class="rct-pen" data-act="rename" data-id="' + esc(p.id) + '" title="Edit name" aria-label="Edit name"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></button>' + (p.bounced ? '<div><span class="rct-pill rct-red">Email bounced</span></div>' : '') + '<div class="rct-asgrow">' + asgHtml(p) + '</div></td>';
      case 'src': return '<td>' + cellBtn(esc(srcLabel(p)), 'src', srcLabel(p)) + '</td>';
      case 'asg': return '<td>' + (p.assigned_to ? cellBtn(esc(firstName(p.assigned_to)) + (p.assigned_mine ? ' (you)' : ''), 'asg', firstName(p.assigned_to)) : cellBtn('<span class="rct-ns">Nobody yet</span>', 'asg', 'Nobody yet')) + '</td>';
      case 'edit': { var le = lastEdit(p); return '<td class="rct-c-edit">' + (le ? cellBtn('<b>' + esc(firstName(le.by)) + '</b>', 'edit', editedLabel(p)) + '<div class="rct-why">' + esc(le.what) + ', ' + esc(fat(le.at)) + '</div>' : '<span class="rct-ns">No changes yet</span>') + '</td>'; }
      // Kate, 17 Nov 2026 ("has profile photo? check or x lang, i narrow down mo this column"): a check for a good photo, an x for no photo or one that is not professional. The words stay in the tooltip and the filter list.
      case 'photo': return '<td class="rct-c-ph">' + cellBtn(!p.photo ? '<span class="rct-phx" role="img" aria-label="No photo" title="No photo">&#10007;</span>' : p.photo_bad ? '<span class="rct-phx rct-phbad" role="img" aria-label="Photo not professional" title="Photo not professional">&#10007;</span>' : '<span class="rct-phok" role="img" aria-label="Has photo" title="Has photo">&#10003;</span>', 'photo', photoLabel(p)) + '</td>';
      case 'pref': return '<td>' + prefSelect(p) + '</td>';
      case 'place': return '<td>' + cellBtn(esc(placeShort(p)), 'place', countryShort(p)) + '</td>';
      case 'ig': {
        var kk = linkKind(p);
        if (kk) {
          var lu = linkUrl(p), ll = kk === 'ig' ? (p.ig_handle ? '@' + String(p.ig_handle).replace(/^@/, '') : 'Instagram') : linkName(p);
          return '<td>' + lk(kk, lu ? '<a class="rct-ig" href="' + esc(lu) + '" target="_blank" rel="noopener">' + esc(ll) + '</a>' : esc(ll)) + '</td>';
        }
        var v = igLabel(p); return '<td>' + cellBtn('<span class="' + (v === 'Not stated' ? 'rct-ns' : 'rct-none') + '">' + esc(v) + '</span>', 'ig', v) + '</td>';
      }
      case 'cv': {
        var cu = cvUrl(p);
        return '<td class="rct-c-cv">' + (cu ? '<span class="rct-lk"><span class="rct-lki" title="' + (cvIsWord(p) ? CV_WORD_TIP : 'CV') + '">' + (cvIsWord(p) ? DL_ICON : CV_ICON) + '</span><a class="rct-ig" href="' + esc(cu) + '" target="_blank" rel="noopener"' + (cvIsWord(p) ? ' title="' + CV_WORD_TIP + '"' : '') + '>CV</a></span>'
          : p.cv_file ? '<span class="rct-lk"><span class="rct-lki" title="' + (cvIsWord(p) ? CV_WORD_TIP : 'CV') + '">' + (cvIsWord(p) ? DL_ICON : CV_ICON) + '</span><button type="button" class="rct-linkbtn" data-act="cvfile" data-id="' + esc(p.id) + '" title="' + esc((cvIsWord(p) ? CV_WORD_TIP + ': ' : '') + (p.cv_file_name || 'CV')) + '">CV</button></span>'
          : inEmail(p) ? cellBtn('<span class="rct-ns rct-nw">Checking the email</span>', 'cv', cvLabel(p))
          : cellBtn('<span class="rct-ns rct-nw">' + (deadCv(p) ? 'CV link broken' : 'No CV') + '</span>', 'cv', cvLabel(p))) + '</td>';
      }
      case 'exp': return '<td>' + cellBtn(esc(p.experience || 'Not stated'), 'exp', p.experience || 'Not stated') + '</td>';
      case 'role': return '<td>' + roleSelect(p) + '</td>';
      case 'emp': { var ev = empType(p); return '<td>' + cellBtn(ev === 'Not stated' ? '<span class="rct-ns">Not stated</span>' : esc(ev), 'emp', ev) + '</td>'; }
      case 'applied': return '<td>' + cellBtn(esc(fat(p.applied_at)), 'applied', monthOf(p)) + '</td>';
      case 'wait': {
        if (p.stage !== 'new') return '<td><span class="rct-ns">-</span></td>';
        if (p.replied_at) return '<td>' + cellBtn('<span class="rct-pill rct-grey">We replied</span>', 'wait', 'We replied') + '</td>';
        var d = waited(p), wd = waitDays(), cl = d >= wd + 7 ? 'rct-red' : d >= wd ? 'rct-amber' : 'rct-grey';
        return '<td><button type="button" class="rct-pill rct-pillbtn ' + cl + '" data-cf="wait" data-cv="' + esc(waitBucket(p)) + '">' + d + ' day' + (d === 1 ? '' : 's') + '</button></td>';
      }
      case 'status': {
        var b = bucket(p), sv = statusText(p), cls = b === 'look' ? 'rct-green' : b === 'no' ? 'rct-amber' : b === 'done' ? 'rct-grey' : stageCls(p);
        var main1 = b === 'no' ? 'Probably no' : sv, why = b === 'no' ? flags(p).map(function (f0) { return FLAG_SHORT[f0.k]; }).join(', ') : '';
        if (p.stage === 'new') {
          var ab = autoBucket(p), cur = p.is_test ? 'test' : p.look_ok ? 'look' : p.no_ok ? 'no' : 'auto';
          return '<td>' + lazyDD('bk', p) + (why ? '<div class="rct-why">' + esc(why) + '</div>' : '') + extraPills(p) + '</td>';
        }
        return '<td><button type="button" class="rct-pill rct-pillbtn ' + cls + '" data-cf="status" data-cv="' + esc(sv) + '">' + esc(main1) + '</button>' + (why ? '<div class="rct-why">' + esc(why) + '</div>' : '') + (byLine(p) ? '<div class="rct-why">' + esc(byLine(p)) + '</div>' : '') + extraPills(p) + '</td>';
      }
      case 'acts': {
        var id = esc(p.id);
        if (usesPipe(p)) return '<td class="rct-c-acts">' + pipeActs(p) + '</td>';
        if (p.stage === 'new') return '<td class="rct-c-acts">' + sideActs(p) + '</td>';
        if (p.stage === 'screening' || p.stage === 'interview_booked' || p.stage === 'not_now' || p.stage === 'rejected') return '<td class="rct-c-acts">' + sideActs(p) + '</td>';
        if (p.stage === 'trade_test') return '<td class="rct-c-acts"><button type="button" class="rct-btn rct-sm rct-pri" data-act="ttgood" data-id="' + id + '">Trade test good</button><button type="button" class="rct-btn rct-sm" data-act="ttbad" data-id="' + id + '">Not good</button></td>';
        if (p.stage === 'offer') return '<td class="rct-c-acts"><button type="button" class="rct-btn rct-sm rct-pri" data-act="hire" data-id="' + id + '">Set starting date</button></td>';
        if (p.stage === 'hired') return '<td class="rct-c-acts">' + (p.start_date ? '<span class="rct-pill rct-green">Starts ' + esc(fdate(p.start_date)) + '</span>' : '') + '</td>';
        return '<td class="rct-c-acts"></td>';
      }
    }
    return '<td></td>';
  }
  function renderList() {
    var all = rows.filter(laneOk), list = sortedRows(listRows()), doneN = rows.filter(function (p) { return !p.is_test && bucket(p) === 'done'; }).length;
    var h = '<div class="rct-tcount">Showing ' + list.length + ' of ' + all.length +
      (S.lane ? '' : (q.trim().length >= 2 ? '. Not now people are searched too' : S.showDone ? '. Not now people are included. <button type="button" class="rct-linkbtn" data-act="toggledone">Hide them</button>' : '. Not now people (' + doneN + ') are hidden. <button type="button" class="rct-linkbtn" data-act="toggledone">Show them</button>')) +
      '. ' + (closeNames.length ? nearLine() + ' ' : '') + 'Click a value to filter by it, or use the funnel on a column.' + (Object.keys(S.filters).length ? ' <button type="button" class="rct-linkbtn" data-act="clearfilters">Clear all filters</button>' : '') + '</div>';
    h += '<div class="rct-tbox" id="rctTbox"><table class="rct-table"><thead><tr>';
    COLS.forEach(function (c) {
      if (c.k === 'av') return;   // Kate, 16 Nov 2026: the photo has no title of its own, the Name title spans the photo and the name and sits in the middle of the two
      var sorted = S.sort.col === c.k, act = !!S.filters[c.k] || sorted;
      h += '<th' + (c.k === 'name' ? ' colspan="2" class="rct-thname"' : c.k === 'acts' ? ' class="rct-thacts"' : c.k === 'photo' ? ' class="rct-thph"' : '') + '><div class="rct-th' + (sorted ? ' rct-sorted' : '') + '">' + esc(c.t) + (sorted ? '<span class="rct-sortmark">' + (S.sort.dir === 'asc' ? '&#9650;' : '&#9660;') + '</span>' : '') +
        (c.nofilter ? '' : '<button type="button" class="rct-fbtn' + (act ? ' rct-act' : '') + '" data-fcol="' + c.k + '" aria-label="Filter and sort ' + esc(c.t) + '" aria-haspopup="true">' + ICON_FILTER + '</button>') + '</div></th>';
    });
    h += '</tr></thead><tbody>';
    if (!list.length) h += '<tr><td colspan="' + COLS.length + '"><div class="rct-empty">Nobody matches. <button type="button" class="rct-btn rct-sm" data-act="clearfilters">Clear all filters</button></div></td></tr>';
    // Kate, 10 Nov 2026: the List shows 10 rows a page (10, 20, 50 or 100 on the picker), so it opens short; Grid keeps its own Show 10 more.
    var sig = JSON.stringify([S.filters, S.sort, q, S.lane, S.showDone, S.pageSize]);
    if (sig !== S.pgSig) { S.pgSig = sig; S.page = 0; }
    var pages = Math.max(1, Math.ceil(list.length / S.pageSize)); if (S.page > pages - 1) S.page = pages - 1;
    var from = S.page * S.pageSize, to = Math.min(list.length, from + S.pageSize);
    list.slice(from, to).forEach(function (p) {
      h += '<tr>' + COLS.map(function (c) { return cell(c, p); }).join('') + '</tr>';
      if (openRows[p.id]) h += '<tr class="rct-dtl"><td colspan="' + COLS.length + '"><div class="rct-dtlin">' + detailHtml(p) + '</div></td></tr>';
    });
    h += '</tbody></table></div>';
    if (list.length) {
      h += '<div class="rct-pager"><label class="rct-pgsize">Rows per page <select id="rctPageSize" aria-label="Rows per page">' +
        SIZES.map(function (n) { return '<option value="' + n + '"' + (n === S.pageSize ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
        '<span class="rct-pgcount">' + (from + 1) + ' to ' + to + ' of ' + list.length + '</span>' +
        '<span class="rct-pgbtns"><button type="button" class="rct-btn rct-sm" data-act="pgprev"' + (S.page === 0 ? ' disabled' : '') + '>Previous</button>' +
        '<button type="button" class="rct-btn rct-sm" data-act="pgnext"' + (S.page >= pages - 1 ? ' disabled' : '') + '>Next</button></span></div>';
    }
    return h;
  }

  /* ----- column filter popover ----- */
  var popCol = null;
  function popEl() { var e = document.getElementById('rctPop'); if (!e) { e = document.createElement('div'); e.id = 'rctPop'; e.className = 'rct-pop'; e.hidden = true; document.body.appendChild(e); } return e; }
  function closePop() { var e = popEl(); e.hidden = true; popCol = null; }
  function openPop(col, btn) {
    var c = colBy(col), list = listRows(col), counts = {}, sample = {};
    list.forEach(function (p) { var v = c.val(p); counts[v] = (counts[v] || 0) + 1; sample[v] = p; });
    var vals = Object.keys(counts).sort(function (a, b) { return c.kind === 'num' ? (c.sort(sample[a]) < c.sort(sample[b]) ? -1 : 1) : a.localeCompare(b); });
    var set = S.filters[col], on = S.sort.col === col, asc = c.asc || 'Sort A to Z', desc = c.desc || 'Sort Z to A';
    var pop = popEl(); popCol = col; pop.__vals = vals;
    pop.innerHTML = '<div class="rct-sortrow"><button type="button" data-sort="asc" class="' + (on && S.sort.dir === 'asc' ? 'rct-on' : '') + '">' + asc + '</button><button type="button" data-sort="desc" class="' + (on && S.sort.dir === 'desc' ? 'rct-on' : '') + '">' + desc + '</button></div>' +
      '<input type="search" id="rctPopQ" placeholder="Search values" autocomplete="off"><div class="rct-ctrl"><button type="button" data-sel="all">Select all</button><button type="button" data-sel="none">Clear selection</button></div>' +
      '<div class="rct-pl" id="rctPopList">' + vals.map(function (v) { return '<label><input type="checkbox" data-v="' + esc(v) + '"' + ((!set || set[v]) ? ' checked' : '') + '> <span>' + esc(v) + '</span><span class="rct-pn">' + counts[v] + '</span></label>'; }).join('') + '</div>' +
      '<div class="rct-pfoot"><button type="button" class="rct-btn rct-sm" data-popclear>Clear filter</button><button type="button" class="rct-btn rct-sm rct-pri" data-popdone>Done</button></div>';
    pop.hidden = false;
    var r = btn.getBoundingClientRect(), w = Math.min(290, innerWidth - 16);
    pop.style.left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8) + 'px'; pop.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - 440)) + 'px'; pop.style.width = w + 'px';
  }
  function reopenPop(col) { var b = document.querySelector('[data-fcol="' + col + '"]'); if (b) openPop(col, b); }
  function renderKeep() {
    var bx = document.getElementById('rctTbox'), pos = bx ? [bx.scrollTop, bx.scrollLeft] : null, pl = document.getElementById('rctPopList'), pt = pl ? pl.scrollTop : 0;
    render();
    var b2 = document.getElementById('rctTbox'); if (b2 && pos) { b2.scrollTop = pos[0]; b2.scrollLeft = pos[1]; }
    return pt;
  }
  function popChange() {
    var pop = popEl(), set = {}, allOn = true;
    [].forEach.call(pop.querySelectorAll('input[type=checkbox]'), function (b) { set[b.getAttribute('data-v')] = b.checked; if (!b.checked) allOn = false; });
    if (allOn) delete S.filters[popCol]; else S.filters[popCol] = set;
    var col = popCol, pt = renderKeep(); reopenPop(col); var pl = document.getElementById('rctPopList'); if (pl) pl.scrollTop = pt;
  }
  function setMode(m) { S.mode = m; saveMode(m); closePop(); render(); }
  // Grid with a tile on: the cards of the people waiting too long (they can be Worth a look or flagged)
  function lateSectionHtml(list) {
    return '<section class="rct-sec"><div class="rct-sech"><h2>Waiting ' + waitDays() + ' days or more<span class="rct-cnt">' + list.length + '</span></h2><span class="rct-hint">Longest waiting first.</span></div>' +
      (list.length ? '<div class="rct-cards">' + list.slice(0, shownLook).map(card).join('') + '</div>' +
        (list.length > shownLook ? '<button type="button" class="rct-btn rct-sm rct-more" data-act="morelook">Show ' + Math.min(PAGE, list.length - shownLook) + ' more (' + (list.length - shownLook) + ' left)</button>' : '') : '<div class="rct-empty">Nobody here.</div>') + '</section>';
  }
  function laneBarHtml() {
    return '<div class="rct-lanebar"><span>Showing only: <b>' + esc(LANE_NAME[S.lane] || S.lane) + '</b>, in both Grid and List.</span><button type="button" data-lane="' + S.lane + '">Show everyone</button></div>';
  }
  function segHtml() {
    return '<div class="rct-seg" role="group" aria-label="Layout"><button type="button" data-mode="list" aria-pressed="' + (S.mode === 'list') + '" title="List (V)" aria-label="List layout">' + ICON_LIST + '</button>' +
      '<button type="button" data-mode="grid" aria-pressed="' + (S.mode === 'grid') + '" title="Grid (V)" aria-label="Grid layout">' + ICON_GRID + '</button></div>';
  }

  /* ---------- dialogs ---------- */
  function dlg() {
    var d = document.getElementById('rctDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'rctDlg'; d.className = 'rct-dlg'; document.body.appendChild(d); d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); }
    return d;
  }
  function openDlg(title, body) {
    var d = dlg();
    d.classList.remove('rct-wide');
    d.onscroll = null;
    d.innerHTML = '<div class="rct rct-dh"><h2>' + title + '</h2><button type="button" class="rct-x" data-close aria-label="Close">&times;</button></div><div class="rct rct-db">' + body + '</div>';
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  }
  function closeDlg() { var d = dlg(); if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } }
  function personById(id) { return rows.filter(function (p) { return String(p.id) === String(id); })[0]; }

  function fill(t, p) {
    var link = setting('booking_link', '') || '[booking link not set yet]';
    return String(t || '').replace(/\{first\}/g, firstName(p && p.name)).replace(/\{link\}/g, link);
  }
  function composeUrl(to, subject, body) {
    return 'https://mail.google.com/mail/?authuser=recruitment@tararosesalon.com&view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  /* the fixed markup of the formatted email, copied from RECRUITMENT-NO-REPLY-EMAIL.html: head, then the paragraphs, then the signature table cells */
  var RH_HEAD = "\u003c!doctype html\u003e\n\u003chtml lang=\"en-GB\"\u003e\n\u003chead\u003e\n\u003cmeta charset=\"utf-8\"\u003e\n\u003cmeta name=\"viewport\" content=\"width=device-width, initial-scale=1\"\u003e\n\u003cmeta name=\"color-scheme\" content=\"light dark\"\u003e\n\u003cmeta name=\"supported-color-schemes\" content=\"light dark\"\u003e\n\u003ctitle\u003eYour application to Tara Rose Salons\u003c/title\u003e\n\u003cstyle\u003e\n  :root { color-scheme: light dark; }\n  body { margin:0; padding:0; background:#F1ECE3; }\n  @media (prefers-color-scheme: dark) {\n    body, .outer { background:#1C1B18 !important; }\n    .card { background:#2D2E37 !important; }\n    .ink { color:#FAF8F4 !important; }\n    .muted { color:#A9A9AF !important; }\n    .rule { border-color:#45464F !important; }\n    a { color:#FAF8F4 !important; }\n  }\n\u003c/style\u003e\n\u003c/head\u003e\n\u003cbody style=\"margin:0;padding:0;background:#F1ECE3;\"\u003e\n\u003ctable role=\"presentation\" class=\"outer\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#F1ECE3;\"\u003e\n  \u003ctr\u003e\n    \u003ctd align=\"center\" style=\"padding:24px 16px;\"\u003e\n      \u003ctable role=\"presentation\" class=\"card\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"max-width:560px;background:#FAF8F4;border-radius:14px;\"\u003e\n        \u003ctr\u003e\n          \u003ctd style=\"padding:28px 32px 8px 32px;\"\u003e\n            \u003cdiv class=\"ink\" style=\"font-family:\u0027Playfair Display\u0027,Georgia,serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#2D2E37;\"\u003eTara Rose Salons\u003c/div\u003e\n          \u003c/td\u003e\n        \u003c/tr\u003e\n        \u003ctr\u003e\n          \u003ctd style=\"padding:0 32px;\"\u003e\n            \u003cdiv class=\"rule\" style=\"border-top:1px solid #E4E2DF;height:1px;line-height:1px;font-size:1px;\"\u003e\u0026nbsp;\u003c/div\u003e\n          \u003c/td\u003e\n        \u003c/tr\u003e\n        \u003ctr\u003e\n          \u003ctd class=\"ink\" style=\"padding:20px 32px 8px 32px;font-family:Inter,\u0027Helvetica Neue\u0027,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2D2E37;\"\u003e";
  var RH_MID = "          \u003c/td\u003e\n        \u003c/tr\u003e\n        \u003ctr\u003e\n          \u003ctd style=\"padding:8px 32px 28px 32px;font-family:Inter,\u0027Helvetica Neue\u0027,Helvetica,sans-serif;\"\u003e";
  var RH_NAME = "            \u003cdiv class=\"ink\" style=\"font-family:\u0027Playfair Display\u0027,Georgia,serif;font-size:18px;color:#2D2E37;\"\u003eEmma-Louise Usher\u003c/div\u003e";
  var RH_TITLE = "            \u003cdiv class=\"muted\" style=\"font-size:14px;line-height:1.5;color:#74747B;\"\u003eGeneral Manager, Tara Rose Salons\u003c/div\u003e";
  var RH_TAIL = "          \u003c/td\u003e\n        \u003c/tr\u003e\n      \u003c/table\u003e\n    \u003c/td\u003e\n  \u003c/tr\u003e\n\u003c/table\u003e\n\u003c/body\u003e\n\u003c/html\u003e\n";

/* ---------- the No reply (approved wording, docs/RECRUITMENT-NO-REPLY-EMAIL.md in the cowork repo, brand review SHIP 9 Nov 2026) ----------
   The text is stored in recruit_settings.decline_template and can be edited on the page. Markers: {greeting} (the whole first line, filled per person),
   **bold**, [link text]({careers_url}). The LAST block is the signature (sign-off, name, title lines). The same text becomes the formatted email (table
   layout, inline styles, brand fonts with fallbacks, light and dark, exactly the markup of RECRUITMENT-NO-REPLY-EMAIL.html) and a plain text version. */
  var CAREERS_URL = 'https://www.tararosesalon.com/en/ae/careers/';
  var DEFAULT_SUBJECT = 'Your application to Tara Rose Salons';
  var DEFAULT_DECLINE = '{greeting}\n\nThank you for applying to Tara Rose Salons. I have reviewed your application, and I would rather give you a clear answer than leave you waiting.\n\n**We will not be taking your application forward at this time.**\n\nWe know this is not the answer you were hoping for, and we know how much effort goes into an application. We are grateful you chose us.\n\nIf you would like to talk to us again in future, you are welcome to do so through the [careers page on our website]({careers_url}).\n\nThank you again, and I wish you every success with what comes next.\n\nWarm regards,\nEmma-Louise Usher\nGeneral Manager, Tara Rose Salons';

  // "Hi Sarah," from a readable first name, "Hi there," when there is none or it is not a name. Always replaces the whole line.
  function greetingFor(p, there) {
    if (there) return 'Hi there,';
    var n = String((p && p.name) || '').trim().split(/\s+/)[0] || '';
    var ok = false;
    try { ok = /^[\p{L}][\p{L}'’\-]+$/u.test(n); } catch (e) { ok = /^[A-Za-z][A-Za-z'’\-]+$/.test(n); }
    if (!ok) return 'Hi there,';
    if (n === n.toUpperCase() || n === n.toLowerCase()) n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    return 'Hi ' + n + ',';
  }
  function declineBlocks(tpl) { return String(tpl || '').replace(/\r/g, '').split(/\n[ \t]*\n/).map(function (b) { return b.replace(/^\n+|\n+$/g, ''); }).filter(function (b) { return b.trim() !== ''; }); }
  function mdInline(s, greeting) {
    var t = esc(String(s).replace(/\{greeting\}/g, greeting));
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, url) {
      url = url.replace(/\{careers_url\}/g, CAREERS_URL).replace(/&amp;/g, '&');
      return /^https:\/\/[^\s"<>]+$/i.test(url) ? '<a href="' + esc(url) + '" style="color:#2D2E37;text-decoration:underline;">' + txt + '</a>' : txt;
    });
    return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  function plainInline(s, greeting) {
    return String(s).replace(/\{greeting\}/g, greeting).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1');
  }
  // greeting: the text for the {greeting} line. Returns { subject, text, html } for one person, or for a bulk send (there = true).
  function replyParts(p, there, greetingOverride, tplOverride, subjOverride, sig) {
    var greeting = greetingOverride || greetingFor(p, there);
    var subject = subjOverride || String(setting('decline_subject', DEFAULT_SUBJECT) || DEFAULT_SUBJECT);
    var blocks = declineBlocks(tplOverride || setting('decline_template', DEFAULT_DECLINE) || DEFAULT_DECLINE);
    // Kate, 16 Nov 2026 ("edit, make recruitment sign off instead of emma louise"): the No reply is signed by the Recruitment Team like the shortlist email. A last block with
    // line breaks in the saved wording (the old sign-off, name, title) is dropped and replaced by Warm regards, plus the Recruitment Team signature.
    if (!tplOverride && !sig) {
      if (blocks.length > 1 && blocks[blocks.length - 1].indexOf('\n') >= 0) blocks.pop();
      blocks.push('Warm regards,'); sig = { html: SL_SIG_HTML, text: SL_SIG_TEXT };
    }
    var sign = blocks.length > 1 ? blocks.pop().split('\n') : [];
    var text = blocks.concat(sign.length ? [sign.join('\n')] : []).map(function (b) { return plainInline(b, greeting); }).join('\n\n');
    var paras = blocks.map(function (b, i) {
      var last = i === blocks.length - 1;
      return '            <p style="margin:0 0 ' + (last ? '24' : '16') + 'px 0;">' + mdInline(b, greeting).replace(/\n/g, '<br>') + '</p>';
    });
    var signOff = sign.length ? '            <p style="margin:0;">' + mdInline(sign[0], greeting) + '</p>' : '';
    var nameDiv = sign.length > 1 ? RH_NAME.replace('Emma-Louise Usher', function () { return mdInline(sign[1], greeting); }) : '';
    var titleDivs = sign.slice(2).map(function (l) { return RH_TITLE.replace('General Manager, Tara Rose Salons', function () { return mdInline(l, greeting); }); });
    var head = RH_HEAD.replace('Your application to Tara Rose Salons', function () { return esc(subject); });
    if (sig) head = head.replace('.rule { border-color:#45464F !important; }', function () { return '.rule { border-color:#45464F !important; }\n    .sigrule { border-color:#FAF8F4 !important; }\n    .logo { filter:invert(1); }'; });
    var html = head + '\n' + paras.concat(signOff ? [signOff] : []).join('\n') + '\n' + RH_MID +
      (sig ? '\n' + sig.html : (nameDiv ? '\n' + nameDiv : '') + (titleDivs.length ? '\n' + titleDivs.join('\n') : '')) + '\n' + RH_TAIL;
    var htmlCopy = head + '\n' + paras.concat(signOff ? [signOff] : []).join('\n') + '\n' + RH_TAIL;
    return { subject: subject, text: text, html: html, htmlCopy: htmlCopy, textFull: sig ? text + '\n' + sig.text : text };
  }
  // Kate, 16 Nov 2026: the automatic email to a shortlisted support-role applicant (brand review of the wording: no BLOCK, soft notes applied; the number that will call is left out on purpose).
  // Same formatted layout and the same recruitment signature as the No reply (its last block), so changing the signature there changes it here. Sent from recruitment@ by
  // apps-script/send-recruitment-mail.gs after recruit_queue_email() queues it (migrations/recruit_shortlist_email.sql).
  var SL_SUBJECT = 'Thank you for applying to Tara Rose';
  var SL_BODY = '{greeting}\n\nThank you for applying to Tara Rose. We have shortlisted your application, and a member of our team will phone you to arrange your interview.\n\nPlease keep an eye out for a call from us.\n\nWe look forward to speaking with you.';
  // Kate, 16 Nov 2026: this email is signed by the Recruitment Team, not by Coach Emma ("fix mo yung email sign off, wag si coach emma"), laid out exactly like the signature in the
  // recruitment@ Gmail ("gayahin yung format mismo"): logo, Recruitment (bold serif) Team (grey), globe + website link, black rule, the salon line, the branches, the hiring line.
  // The brand name reads Tara Rose Salons with the s ("tara rose salons ah, with an s sa dulo"), and so does the logo (the SALONS logo, not the SALON one in the Gmail signature).
  // The text that goes into Gmail by hand ends at "Warm regards," because Gmail adds this signature under it by itself; the automatic email carries the whole block.
  var SL_SITE = 'https://www.tararosesalon.com/en/ae/';
  var SL_LOGO = 'https://trk-salon-os.com/assets/email-logo-tp.png';
  var SL_GLOBE = 'https://img.newoldstamp.com/t/8/w.png';
  var SL_SIG_TEXT = 'Recruitment Team\ntararosesalon.com/en/ae/\n\nTara Rose Salons\nKhalifa City A | Saadiyat | Motor City | Al Quoz\nWe\u2019re hiring across Dubai & Abu Dhabi \u2192 tararosesalon.com/careers';
  var SL_SIG_HTML =
    '            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:350px;max-width:100%;">\n' +
    '              <tr><td style="padding:0 0 8px 0;"><img class="logo" src="' + SL_LOGO + '" alt="Tara Rose Salons" width="110" style="display:block;width:110px;height:auto;border:0;"></td></tr>\n' +
    '              <tr><td style="font-family:\'Playfair Display\',Georgia,\'Times New Roman\',serif;font-size:20px;line-height:1.25;font-weight:bold;"><span class="ink" style="color:#030303;">Recruitment</span> <span style="color:#9B9B9B;">Team</span></td></tr>\n' +
    '              <tr><td style="padding:2px 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;"><img src="' + SL_GLOBE + '" alt="" width="14" height="14" style="display:inline-block;vertical-align:middle;border:0;"> <a class="ink" href="' + SL_SITE + '" style="color:#030303;text-decoration:underline;">tararosesalon.com/en/ae/</a></td></tr>\n' +
    '              <tr><td class="sigrule" style="border-top:2px solid #030303;height:0;font-size:0;line-height:0;">&nbsp;</td></tr>\n' +
    '              <tr><td class="ink" style="padding:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#030303;">Tara Rose Salons</td></tr>\n' +
    '              <tr><td class="ink" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#030303;">Khalifa City A | Saadiyat | Motor City | Al Quoz</td></tr>\n' +
    '              <tr><td class="ink" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#030303;white-space:nowrap;">We\u2019re hiring across Dubai &amp; Abu Dhabi \u2192 <a href="' + CAREERS_URL + '" style="color:#1155CC;text-decoration:underline;">tararosesalon.com/careers</a></td></tr>\n' +
    '            </table>';
  function shortlistEmailParts(p) {
    return replyParts(p, false, null, SL_BODY + '\n\nWarm regards,', SL_SUBJECT, { html: SL_SIG_HTML, text: SL_SIG_TEXT });
  }
  // Rich text on the clipboard so it pastes formatted into Gmail; plain text is the fallback part. Returns 'rich', 'plain' or ''.
  async function copyRich(html, text) {
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
        return 'rich';
      }
    } catch (e) { console.warn('rich copy refused', e); }
    try {
      var box = document.createElement('div'); box.contentEditable = 'true'; box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      var m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html); box.innerHTML = m ? m[1] : html; document.body.appendChild(box);
      var rg = document.createRange(); rg.selectNodeContents(box); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
      var okc = document.execCommand('copy'); sel.removeAllRanges(); document.body.removeChild(box);
      if (okc) return 'rich';
    } catch (e2) { console.warn('select copy refused', e2); }
    try { await navigator.clipboard.writeText(text); return 'plain'; } catch (e3) { return ''; }
  }
  function isReviewed(p) { return !!(p && p.reviewed_at); }
  // Someone opened a person's details: the reply says "I have reviewed your application", so only reviewed people can get it in bulk.
  function markReviewed(ids) {
    var todo = ids.filter(function (id) { var p = personById(id); return p && !p.reviewed_at; }); if (!todo.length) return;
    var now = new Date().toISOString();
    todo.forEach(function (id) { var p = personById(id); p.reviewed_at = now; p.reviewed_by = me; });
    sb.rpc('recruit_mark_reviewed', { p_ids: todo }).then(function (r) {
      if (r.error) { console.error(r.error); todo.forEach(function (id) { var p = personById(id); if (p && p.reviewed_by === me && p.reviewed_at === now) { p.reviewed_at = null; p.reviewed_by = null; } }); }
    });
  }
  function previewFrame(html, h) { return '<iframe class="rct-prev" title="The email as it will look" sandbox="" style="height:' + (h || 440) + 'px" srcdoc="' + esc(html) + '"></iframe>'; }
  function gmailUrl(to, subject) {
    return 'https://mail.google.com/mail/?authuser=recruitment@tararosesalon.com&view=cm&fs=1' + (to ? '&to=' + encodeURIComponent(to) : '') + '&su=' + encodeURIComponent(subject);
  }
  // Kate, 16 Nov 2026: the No email is signed by the Recruitment Team too, so there is no signature to confirm any more.
  var NO_WORDS = function () { return ''; };
  // The No for one person: marks nothing itself (the caller already did), shows the email and offers Copy reply and Open in Gmail.
  function noDialog(id) {
    var p = personById(id); if (!p) return;
    var rp = replyParts(p, false);
    var canMail = !!p.email && !p.bounced;
    openDlg('No for ' + esc(firstName(p.name)),
      '<p>' + esc(p.name || 'This person') + ' is marked <b>Not now</b>. Nothing has been sent. To tell them, copy the reply and paste it into a new email from the recruitment inbox, or open Gmail with the address and subject ready.</p>' +
      NO_WORDS() +
      (p.bounced ? '<p class="rct-amberbox">Their email bounced. Message them on WhatsApp instead.</p>' : (!p.email ? '<p class="rct-amberbox">No email address on file.</p>' : '')) +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="copyno" data-id="' + esc(p.id) + '">Copy reply</button>' +
      (canMail ? '<a class="rct-btn" href="' + esc(gmailUrl(p.email, rp.subject)) + '" target="_blank" rel="noopener">Open in Gmail</a>' : '<button type="button" class="rct-btn" disabled>Open in Gmail</button>') + '</div>' +
      '<div><div class="rct-lab">How the email looks</div>' + previewFrame(rp.html) + '</div>' +
      '<p class="rct-hint">Copy reply pastes with the formatting into Gmail. Sending stays your click.</p>');
  }

  function autoMailNote(p) {
    return setting('shortlist_email_enabled', false) && notifyRole(roleGroup(p)) && p.email && !p.bounced
      ? '<p class="rct-amberbox">This same email also goes to them automatically from the recruitment inbox, so there is nothing to send by hand.</p>' : '';
  }
  // Kate, 16 Nov 2026: for Front Desk / Reception and Hair Assistant applicants (ONLY these) the invite is not a Zoom booking link: they are told to keep their line open and that
  // someone from the team will reach out, the same wording as the automatic shortlist email (SL_BODY plus the recruitment signature). Everyone else (stylists, beauticians, Other,
  // Not stated) keeps Coach Emma's own Zoom invite with the booking link.
  // Kate, 17 Nov 2026 ("ate jho handles beautician applications pala, include mo na sya sa pipeline nila ate frans and ate jho"): beauticians are in ate Jho's and ate Frances's line now, with the hiring steps and the keep-your-line-open email.
  function lineOpenRole(p) { var g = roleGroup(p); return g === 'Front Desk / Reception' || g === 'Hair Assistant' || g === 'Beautician'; }
  function shortDialog(id) {
    var p = personById(id); if (!p) return;
    if (lineOpenRole(p)) {
      var rp = shortlistEmailParts(p), t2 = rp.text;
      openDlg('Tell ' + esc(firstName(p.name)) + ' to keep their line open',
        '<div><div class="rct-lab">Reply, ready to send</div><pre class="rct-reply" id="rctReply">' + esc(t2) + '</pre><p class="rct-hint">In Gmail the Recruitment Team signature is added under Warm regards by itself.</p></div>' +
        (p.bounced ? '<p class="rct-amberbox">Their email bounced. Message them on WhatsApp instead.</p>' : '') +
        '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="invite" data-id="' + esc(p.id) + '">Mark as invited</button><button type="button" class="rct-btn" data-act="copy">Copy reply</button></div>' +
        (p.email && !p.bounced ? '<a class="rct-btn rct-sm" href="' + esc(composeUrl(p.email, rp.subject, t2)) + '" target="_blank" rel="noopener">Open in Gmail from the recruitment inbox</a>' : '') +
        autoMailNote(p) +
        '<div><div class="rct-lab">How the automatic email looks</div>' + previewFrame(rp.html, 520) + '</div>' +
        '<p class="rct-hint">The dashboard does not send this by hand. Send the reply (or let the automatic email go), then press Mark as invited so they move to Screening.</p>');
      return;
    }
    var txt = fill(setting('invite_template', ''), p), hasLink = !!setting('booking_link', '');
    openDlg('Invite ' + esc(firstName(p.name)) + ' to interview',
      '<div><div class="rct-lab">Booking link</div>' + (hasLink ? '<p class="rct-linkline">' + esc(setting('booking_link', '')) + '</p>' : '<p class="rct-amberbox">Not set yet. <button type="button" class="rct-linkbtn" data-act="settings">Set the booking link</button></p>') + '</div>' +
      '<div><div class="rct-lab">Reply, ready to send</div><pre class="rct-reply" id="rctReply">' + esc(txt) + '</pre>' +
      (setting('templates_confirmed', false) ? '' : '<p class="rct-hint">Placeholder wording until you save your own under Booking link and replies. Every template goes through the brand review before it is used.</p>') + '</div>' +
      (p.bounced ? '<p class="rct-amberbox">Their email bounced. Message them on WhatsApp instead.</p>' : '') +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="invite" data-id="' + esc(p.id) + '">Mark as invited</button><button type="button" class="rct-btn" data-act="copy">Copy reply</button></div>' +
      (p.email && !p.bounced ? '<a class="rct-btn rct-sm" href="' + esc(composeUrl(p.email, 'Your application to Tara Rose', txt)) + '" target="_blank" rel="noopener">Open in Gmail from the recruitment inbox</a>' : '') +
      '<p class="rct-hint">The dashboard does not send this invite. Send the reply, then press Mark as invited so they move to Screening.</p>');
  }
  // Only people someone has looked at: the reply says "I have reviewed your application", so it must be true for every one of them.
  function bulkReviewed(g) { return (noGroups()[g] || []).filter(isReviewed); }
  function bulkDialog(g) {
    var all = noGroups()[g] || []; if (!all.length) return;
    var list = all.filter(isReviewed), skipped = all.length - list.length;
    var name = FLAG_NAME[g];
    var rp = replyParts(null, true);
    var emails = list.map(function (p) { return p.email; }).filter(Boolean);
    openDlg(list.length ? 'No for ' + pl(list.length, 'person', 'people') + '?' : 'Nobody here has been looked at yet',
      '<p>Group: <b>' + esc(name) + '</b>. The reply says <i>I have reviewed your application</i>, so it only goes to people you have looked at: ' +
      '<b>' + list.length + ' of ' + all.length + '</b>. Open a person with <b>Look</b> and they are included.</p>' +
      (skipped ? '<p class="rct-amberbox">' + pl(skipped, 'person is', 'people are') + ' left out because nobody has opened ' + (skipped === 1 ? 'them' : 'them') + ' yet.</p>' : '') +
      (list.length ? '<p>Marking them <b>Not now</b> moves them out of your list (undo for a few seconds, or put one back later). <b>Nothing is sent from the dashboard.</b></p>' +
      '<div class="rct-card rct-list rct-flat">' + list.slice(0, 15).map(function (p) { return '<div class="rct-row">' + avatar(p) + '<div class="rct-who"><b>' + esc(p.name || 'Name not stated') + '</b><span>' + esc([p.emirate, p.country].filter(Boolean).join(', ')) + '</span></div><div class="rct-acts">' + waitPill(p) + '</div></div>'; }).join('') + (list.length > 15 ? '<p class="rct-hint">and ' + (list.length - 15) + ' more.</p>' : '') + '</div>' +
      NO_WORDS() +
      '<div><div class="rct-lab">The reply, for a Bcc send (it says Hi there, to everyone)</div>' + previewFrame(rp.html, 380) + '</div>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-danger" data-act="bulkgo" data-g="' + esc(g) + '">Not now for ' + list.length + '</button><button type="button" class="rct-btn" data-close>Cancel</button></div>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-sm" data-act="copybulk">Copy reply</button>' +
      (emails.length ? '<button type="button" class="rct-btn rct-sm" data-act="copyemails" data-g="' + esc(g) + '">Copy ' + pl(emails.length, 'email address', 'email addresses') + ' for Bcc</button>' : '<button type="button" class="rct-btn rct-sm" disabled>No email addresses</button>') + '</div>' +
      '<a class="rct-btn rct-sm" href="' + esc(gmailUrl('', rp.subject)) + '" target="_blank" rel="noopener">Open Gmail with the subject ready</a>' +
      '<p class="rct-hint">Paste the copied reply into the message body and the addresses into Bcc, then send from the recruitment inbox. Sending stays your click.</p>'
      : '<div class="rct-btns"><button type="button" class="rct-btn" data-close>Close</button></div>'));
  }
  /* ---------- add a person by hand (Kate, 16 Nov 2026: walk-ins and anyone who is not in the inboxes; migrations/recruit_add_person.sql) ---------- */
  var ADD_WHERE = ['Walked in at Saadiyat / Mamsha', 'Walked in at Khalifa City A', 'Walked in at Motor City', 'Walked in at Al Quoz', 'Phone call', 'Told us in person', 'Referred by a team member', 'Other'];
  var CV_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  function addDialog() {
    openDlg('Add a person',
      '<p class="rct-hint">For someone who applied in person or by phone, so is not in the inboxes. Only the name is needed. They show as Added by hand and start in the New list.</p>' +
      '<label class="rct-field"><span>Name</span><input type="text" id="rctAdN" maxlength="120" autocomplete="off"></label>' +
      '<label class="rct-field"><span>Applying for</span><select id="rctAdR"><option value="">Not stated</option>' + ROLE_CHOICES.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select></label>' +
      '<label class="rct-field"><span>How they applied</span><select id="rctAdW"><option value="">Not stated</option>' + ADD_WHERE.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select></label>' +
      '<label class="rct-field"><span>Mobile or WhatsApp number</span><input type="text" id="rctAdP" inputmode="tel" maxlength="40" autocomplete="off"></label>' +
      '<label class="rct-field"><span>Email (leave empty if they have none)</span><input type="text" id="rctAdE" inputmode="email" maxlength="200" autocomplete="off"></label>' +
      '<label class="rct-field"><span>Emirate or city</span><input type="text" id="rctAdM" maxlength="80" autocomplete="off"></label>' +
      '<label class="rct-field"><span>Experience (for example 3 years, or Fresh graduate)</span><input type="text" id="rctAdX" maxlength="120" autocomplete="off"></label>' +
      '<label class="rct-field"><span>Link to their work (Instagram, portfolio)</span><input type="text" id="rctAdL" maxlength="500" autocomplete="off"></label>' +
      '<label class="rct-field"><span>Notes</span><textarea id="rctAdA" rows="3" maxlength="1500"></textarea></label>' +
      '<label class="rct-field"><span>CV (PDF, Word or a picture, up to 5 MB)</span><input type="file" id="rctAdC" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"></label>' +
      '<label class="rct-field"><span>Photo</span><input type="file" id="rctAdF" accept="image/*"></label>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="saveperson">Add person</button><button type="button" class="rct-btn" data-close>Cancel</button></div><p class="rct-say" id="rctSay" role="status"></p>');
    var n = document.getElementById('rctAdN'); if (n) n.focus();
  }
  // Uploads a CV to the private bucket and attaches it (recruit_set_cv). Throws a readable error; a stray file is removed when the attach is refused.
  async function uploadCv(p, file, ext) {
    var path = p.id + '/' + Date.now() + '-' + file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80), bucket = sb.storage.from('recruit-cvs');
    var up = await bucket.upload(path, file, { contentType: CV_TYPES[ext], upsert: false }); if (up.error) throw new Error(up.error.message);
    var rc = await rpcEdit('recruit_set_cv', { p_id: p.id, p_path: path, p_name: file.name });
    if (rc.error) { try { await bucket.remove([path]); } catch (e0) { /* stray file, harmless */ } throw new Error(rc.error.message); }
    var old = rc.data && rc.data.old; if (old && old !== path) { try { await bucket.remove([old]); } catch (e1) { /* harmless */ } }
    p.cv_file = path; p.cv_file_name = file.name;
  }
  async function savePerson(btn) {
    var say = document.getElementById('rctSay'), val = function (id) { var e = document.getElementById(id); return e ? (e.value || '').trim() : ''; };
    var name = val('rctAdN'); if (!name) { if (say) say.textContent = 'Type their name first.'; return; }
    var cvf = document.getElementById('rctAdC') && document.getElementById('rctAdC').files[0], phf = document.getElementById('rctAdF') && document.getElementById('rctAdF').files[0];
    var ext = cvf ? (cvf.name.split('.').pop() || '').toLowerCase() : '';
    if (cvf && (!CV_TYPES[ext] || cvf.size > 5242880)) { if (say) say.textContent = 'The CV must be a PDF, Word file or picture, up to 5 MB.'; return; }
    var where = val('rctAdW'), notes = val('rctAdA'), about = [where, notes].filter(Boolean).join('. ');
    btn.disabled = true; if (say) say.textContent = 'Saving.';
    var id = null, issues = [];
    try {
      var r = await sb.rpc('recruit_add_person', { p_name: name, p_whatsapp: val('rctAdP'), p_email: val('rctAdE'), p_role: val('rctAdR'), p_emirate: val('rctAdM'), p_country: '', p_experience: val('rctAdX'), p_about: about, p_work_link: val('rctAdL') });
      if (r.error) throw new Error(r.error.message);
      var d = r.data || {}; id = d.id;
      if (d.duplicate) {
        await window.renderRecruitment(); closeDlg();
        S.lane = null; S.filters = {}; q = ''; openRows[id] = true; render();
        var dup = main() && main().querySelector('[data-id="' + id + '"]'); if (dup && dup.scrollIntoView) dup.scrollIntoView({ block: 'center' });
        toast((d.name || name) + ' is already on the list (same email, number or name). Nothing was changed.'); return;
      }
    } catch (e) { console.error(e); btn.disabled = false; if (say) say.textContent = 'That did not save: ' + (e.message || 'try again'); return; }
    if (cvf) {
      try {
        await uploadCv({ id: id }, cvf, ext);
      } catch (e1) { console.error(e1); issues.push('the CV did not attach (' + (e1.message || 'error') + ')'); }
    }
    await window.renderRecruitment();
    var pn = personById(id);
    if (phf && pn) { try { await savePhoto(pn, phf); } catch (e2) { console.error(e2); issues.push('the photo did not attach (' + (e2.message || 'error') + ')'); } }
    closeDlg(); S.lane = null; S.filters = {}; q = ''; openRows[id] = true; render();
    var el2 = main() && main().querySelector('[data-id="' + id + '"]'); if (el2 && el2.scrollIntoView) el2.scrollIntoView({ block: 'center' });
    toast(name + ' is added to New.' + (issues.length ? ' But ' + issues.join(' and ') + '. Open the person to add it again.' : ''));
  }
  function settingsDialog() {
    openDlg('Booking link and replies',
      '<label class="rct-field"><span>Booking link (the calendar page candidates choose a time on)</span><input type="url" id="rctLink" value="' + esc(setting('booking_link', '')) + '" placeholder="https://">' + setNote('booking_link') + '</label>' +
      '<label class="rct-field"><span>Invite reply. {first} becomes their first name and {link} the booking link.</span><textarea id="rctInv" rows="6">' + esc(setting('invite_template', '')) + '</textarea>' + setNote('invite_template') + '</label>' +
      '<label class="rct-field"><span>The No email: subject</span><input type="text" id="rctSub" value="' + esc(setting('decline_subject', DEFAULT_SUBJECT)) + '">' + setNote('decline_subject') + '</label>' +
      '<label class="rct-field"><span>The No email: wording. The first line {greeting} becomes Hi and their first name (or Hi there,). Use **bold** and [link text]({careers_url}). The Recruitment Team signature is added under it by itself (a last block with the old sign-off lines is ignored).</span><textarea id="rctDec" rows="14">' + esc(setting('decline_template', DEFAULT_DECLINE)) + '</textarea>' + setNote('decline_template') + '</label>' +
      '<div><button type="button" class="rct-btn rct-sm" data-act="usedefault">Put the approved wording back</button></div>' +
      '<label class="rct-check"><input type="checkbox" id="rctOk"' + (setting('templates_confirmed', false) ? ' checked' : '') + '> The invite reply above is the final wording (it has been through the brand review)' + setNote('templates_confirmed') + '</label>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="savesettings">Save</button><button type="button" class="rct-btn" data-close>Cancel</button></div><p class="rct-say" id="rctSay" role="status"></p>');
  }

  /* ---------- saving ---------- */
  /* ----- photos (Kate, 10 Nov 2026): added by hand, one by one or in bulk by file name; private bucket recruit-photos, a 240 px jpeg each ----- */
  async function loadPhotoUrls() {
    var paths = rows.map(function (p) { return p.photo; }).filter(function (x) { return x && !PHOTO[x]; });
    if (!paths.length) return;
    try {
      var r = await sb.storage.from('recruit-photos').createSignedUrls(paths, 3600);
      if (r.error) throw r.error;
      (r.data || []).forEach(function (x) { if (x && x.signedUrl && x.path) PHOTO[x.path] = x.signedUrl; });
    } catch (e) { console.error('photo links', e); }
  }
  // any image the browser can read, cut to a centred square, 240 px, jpeg
  function squareJpeg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h), c = document.createElement('canvas');
          c.width = c.height = 240;
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 240);
          g.drawImage(img, (w - side) / 2, (h - side) / 3, side, side, 0, 0, 240, 240);   // a little high of centre: faces sit in the upper half
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error('could not shrink the picture')); }, 'image/jpeg', 0.86);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('this file cannot be read as a picture' + (/hei[cf]/i.test(file.type + file.name) ? ' (HEIC: save it as JPG first)' : ''))); };
      img.src = url;
    });
  }
  async function savePhoto(p, file) {
    var blob = await squareJpeg(file), path = p.id + '/' + Date.now() + '.jpg', bucket = sb.storage.from('recruit-photos');
    var up = await bucket.upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw new Error(up.error.message);
    var r = await rpcEdit('recruit_set_photo', { p_id: p.id, p_path: path });
    if (r.error) { try { await bucket.remove([path]); } catch (e) { /* stray file, harmless */ } throw new Error(r.error.message); }
    var old = r.data && r.data.old;
    if (old && old !== path) { try { await bucket.remove([old]); } catch (e) { /* harmless */ } delete PHOTO[old]; }
    p.photo = path;
    if (p.photo_bad) { try { var rf = await rpcEdit('recruit_set_photo_flag', { p_id: p.id, p_flag: false }); if (!rf.error) p.photo_bad = false; } catch (e) { /* the old mark stays, harmless */ } }
    var s2 = await bucket.createSignedUrl(path, 3600); if (s2.data && s2.data.signedUrl) PHOTO[path] = s2.data.signedUrl;
  }
  function fileInput(multiple) {
    var el = document.getElementById(multiple ? 'rctPhotosIn' : 'rctPhotoIn');
    if (!el) { el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.hidden = true; el.id = multiple ? 'rctPhotosIn' : 'rctPhotoIn'; if (multiple) el.multiple = true; document.body.appendChild(el); }
    el.value = ''; return el;
  }
  // Kate, 10 Nov 2026: "i want to be able to paste this directly". Click an avatar for the box (Ctrl+V pastes a copied image, or drop one, or choose a file);
  // or point at an avatar and press Ctrl+V without opening anything.
  var photoFor = null, hoverAv = null;
  // Kate, 11 Nov 2026: a photo that looks personal, not professional, is marked by hand (recruit_set_photo_flag); it makes the person Probably no.
  function photoBadBtn(p, cls) {
    return '<button type="button" class="' + cls + '" data-act="photobad" data-id="' + esc(p.id) + '">' + (p.photo_bad ? 'Photo is fine, take the mark off' : 'Photo is not professional') + '</button>';
  }
  async function togglePhotoBad(id) {
    var p = personById(id); if (!p || !p.photo) return;
    var flag = !p.photo_bad;
    try {
      var r = await rpcEdit('recruit_set_photo_flag', { p_id: p.id, p_flag: flag }); if (r.error) throw new Error(r.error.message);
      p.photo_bad = flag; if (dlg().open && photoFor === String(p.id)) { closeDlg(); photoFor = null; }
      render(); toast(flag ? firstName(p.name) + '\u2019s photo is marked not professional. Probably no.' : 'Mark taken off ' + firstName(p.name) + '.');
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  // Kate, 11 Nov 2026: the CV a person attached to a direct email is kept in the private bucket recruit-cvs (the mailbox script sends it, edge function recruit-cv-upload).
  // "shouldnt be supabase, should be simply trk-salon-os": the file is downloaded here with the signed-in session and shown INSIDE the page (a viewer dialog), so the address
  // bar never leaves trk-salon-os.com and no token or supabase.co link is ever shown. A Word file cannot be shown in a browser, so it downloads, named after the person.
  var CV_TYPE = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  var cvUrlLive = '';
  function cvDownloadName(p, ext) { return 'CV - ' + (String(p.name || 'applicant').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'applicant') + '.' + ext; }
  // Kate, 19 Nov 2026: "Open in a new tab" shows a blob: address that only exists in her own browser, so pasting it to ate Jho gave a dead link. The CV stays in the private bucket (never a public or supabase.co link);
  // the shareable link is the page's own: ?view=recruitment&cand=<id>&opencv=1 opens that person and their CV for anyone who can open Recruitment (ate Jho, ate Frans, Coach Emma, Kate).
  function cvShareLink(p) { return 'https://trk-salon-os.com/?view=recruitment&cand=' + encodeURIComponent(p.id) + '&opencv=1'; }
  async function openCvFile(id) {
    var p = personById(id); if (!p || !p.cv_file) return;
    var ext = String(p.cv_file_name || p.cv_file).split('.').pop().toLowerCase(); if (!CV_TYPE[ext]) ext = 'pdf';
    toast('Opening the CV...');
    try {
      var r = await sb.storage.from('recruit-cvs').download(p.cv_file);
      if (r.error || !r.data) throw new Error(r.error ? r.error.message : 'no file');
      if (cvUrlLive) { try { URL.revokeObjectURL(cvUrlLive); } catch (e) { /* harmless */ } }
      cvUrlLive = URL.createObjectURL(new Blob([r.data], { type: CV_TYPE[ext] }));
      var dl = esc(cvDownloadName(p, ext));
      if (ext === 'doc' || ext === 'docx') {
        var a = document.createElement('a'); a.href = cvUrlLive; a.download = cvDownloadName(p, ext); document.body.appendChild(a); a.click(); a.remove();
        toast('CV downloaded for ' + firstName(p.name) + '. Open it in Word.'); return;
      }
      openDlg('CV: ' + esc(p.name || 'applicant'),
        '<p class="rct-pasteacts"><a class="rct-btn rct-sm" href="' + cvUrlLive + '" download="' + dl + '">Download</a>' +
        '<a class="rct-btn rct-sm" href="' + cvUrlLive + '" target="_blank" rel="noopener">Open in a new tab</a>' +
        '<button type="button" class="rct-btn rct-sm" data-act="cvlink" data-id="' + esc(p.id) + '" title="A link to share on WhatsApp. Whoever opens it signs in to the dashboard first, and the CV opens for them.">Copy link for the team</button>' +
        '<button type="button" class="rct-btn rct-sm" data-act="cvlink7" data-id="' + esc(p.id) + '" title="A private link for someone with no dashboard access. It works for 7 days and opens only this CV.">Copy link for anyone (7 days)</button></p>' +
        (ext === 'pdf' ? '<iframe class="rct-cvframe" title="CV" src="' + cvUrlLive + '"></iframe>' : '<img class="rct-cvimg" alt="CV" src="' + cvUrlLive + '">'));
      dlg().classList.add('rct-wide');
    } catch (e) { console.error(e); toast('That CV did not open: ' + (e.message || 'try again')); }
  }
  async function setBucket(id, to) {
    var p = personById(id); if (!p) return;
    try {
      // Kate, 16 Nov 2026: a Test row is for trying Shortlist: its interviewer WhatsApp goes only to Kate's test number and the row is left out of the counts (migrations/recruit_test_row.sql)
      if (to === 'test') {
        var rt = await rpcEdit('recruit_set_test', { p_id: p.id, p_flag: true }); if (rt.error) throw new Error(rt.error.message);
        p.is_test = true; render(); toast(firstName(p.name) + ' is a Test row now. Shortlist sends the WhatsApp only to you, and the row is left out of the counts.'); return;
      }
      if (p.is_test) { var rf = await rpcEdit('recruit_set_test', { p_id: p.id, p_flag: false }); if (rf.error) throw new Error(rf.error.message); p.is_test = false; }
      var r = await rpcEdit('recruit_set_bucket', { p_id: p.id, p_to: to }); if (r.error) throw new Error(r.error.message);
      p.look_ok = to === 'look'; p.no_ok = to === 'no'; render();
      toast(to === 'look' ? firstName(p.name) + ' is in Worth a look now.' : to === 'no' ? firstName(p.name) + ' is in Probably no now.' : firstName(p.name) + ' is back to the automatic checks.');
    } catch (e) { console.error(e); render(); toast('That did not save: ' + (e.message || 'try again')); }
  }
  // Kate, 11 Nov 2026: "hindi sya dapat kasama, client po sya": a client asking for an appointment, a supplier or a creator is not an applicant. Out of every list and count, kept at the bottom.
  async function setNotApplicant(id, flag) {
    var p = flag ? personById(id) : gone.filter(function (x) { return String(x.id) === String(id); })[0]; if (!p) return;
    try {
      var r = await rpcEdit('recruit_set_not_applicant', { p_id: p.id, p_flag: flag }); if (r.error) throw new Error(r.error.message);
      p.not_app = flag;
      if (flag) { rows = rows.filter(function (x) { return x !== p; }); gone.push(p); } else { gone = gone.filter(function (x) { return x !== p; }); rows.push(p); }
      render(); toast(flag ? (p.name || 'They') + ' is out of the list. Find them under Not applicants at the bottom.' : (p.name || 'They') + ' is back in the list.');
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  // Kate, 11 Nov 2026: "any non applicants can be removed". The Not applicants section is not shown any more. The people stay MARKED (not_applicant) in the database and are only
  // deleted from view: a person deleted outright would be read from the mailbox again on the next run, a marked one is not. Take the next line out to show the section again.
  function goneHtml() {
    return '';
    return '<details class="rct-gone"><summary>Not applicants <span class="rct-cnt">' + gone.length + '</span></summary>' +
      gone.slice().sort(function (a, b2) { return String(a.name || '').localeCompare(String(b2.name || '')); }).map(function (p) {
        return '<div class="rct-gonerow"><div><b>' + esc(p.name || 'Name not stated') + '</b><span>' + esc(String(p.role_txt || '').slice(0, 90)) + '</span></div>' +
          '<button type="button" class="rct-btn rct-sm" data-act="notappback" data-id="' + esc(p.id) + '">Put back</button></div>';
      }).join('') + '</details>';
  }
  function pickPhoto(id) {
    var p = personById(id); if (!p) return;
    photoFor = String(p.id);
    openDlg('Photo for ' + esc(p.name || 'this person'),
      '<div class="rct-pastebox" id="rctPasteBox" tabindex="0" role="button" aria-label="Paste or drop a picture here">' +
        '<b>Paste a picture here</b><span>Copy an image (right click, Copy image), then press Ctrl+V. Or drop an image on this box.</span></div>' +
      '<p class="rct-pasteacts"><button type="button" class="rct-btn rct-sm" data-act="photofile" data-id="' + esc(p.id) + '">Choose a file instead</button>' +
      (p.photo ? '<button type="button" class="rct-btn rct-sm" data-act="photoclear" data-id="' + esc(p.id) + '">Remove photo</button>' + photoBadBtn(p, 'rct-btn rct-sm') : '') + '</p>');
    var box = document.getElementById('rctPasteBox'); if (box) box.focus();
  }
  function pickPhotoFile(id) {
    var p = personById(id); if (!p) return;
    var el = fileInput(false);
    el.onchange = function () { if (el.files && el.files[0]) { closeDlg(); addOnePhoto(p, el.files[0]); } };
    el.click();
  }
  function clipImage(e) {
    var cd = e.clipboardData; if (!cd) return null;
    var f = cd.files && cd.files.length ? [].filter.call(cd.files, function (x) { return /^image\//.test(x.type); })[0] : null;
    if (f) return f;
    var items = cd.items ? [].slice.call(cd.items) : [];
    for (var i = 0; i < items.length; i++) { if (items[i].kind === 'file' && /^image\//.test(items[i].type)) return items[i].getAsFile(); }
    return null;
  }
  document.addEventListener('paste', function (e) {
    var mn = main(); if (!mn || mn.offsetParent === null) return;   // only while this page is the one on screen
    var viaBox = dlg().open && photoFor && document.getElementById('rctPasteBox') ? photoFor : null, tg = e.target, tag = ((tg && tg.tagName) || '').toLowerCase();
    if (!viaBox && (tag === 'input' || tag === 'textarea' || tag === 'select' || (tg && tg.isContentEditable))) return;   // typing, not pasting a photo
    var id = viaBox ? photoFor : hoverAv; if (!id) return;
    var f = clipImage(e); if (!f) return;
    var p = personById(id); if (!p) return;
    e.preventDefault(); if (viaBox) { closeDlg(); photoFor = null; }
    addOnePhoto(p, f);
  });
  document.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('[data-act="photo"]'); hoverAv = a && main() && main().contains(a) ? a.getAttribute('data-id') : null; });
  document.addEventListener('dragover', function (e) { var b = e.target.closest && e.target.closest('#rctPasteBox'); if (b) { e.preventDefault(); b.classList.add('rct-drop'); } });
  document.addEventListener('dragleave', function (e) { var b = e.target.closest && e.target.closest('#rctPasteBox'); if (b) b.classList.remove('rct-drop'); });
  document.addEventListener('drop', function (e) {
    var b = e.target.closest && e.target.closest('#rctPasteBox'); if (!b || !photoFor) return;
    e.preventDefault(); b.classList.remove('rct-drop');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0], p = personById(photoFor);
    if (f && p) { closeDlg(); photoFor = null; addOnePhoto(p, f); }
  });
  async function addOnePhoto(p, file) {
    try { await savePhoto(p, file); render(); toast('Photo saved for ' + firstName(p.name) + '.'); }
    catch (e) { console.error(e); toast('That photo did not save: ' + (e.message || 'try again')); }
  }
  async function clearPhoto(id) {
    var p = personById(id); if (!p || !p.photo) return;
    try {
      var r = await rpcEdit('recruit_clear_photo', { p_id: p.id });
      if (r.error) throw new Error(r.error.message);
      var old = r.data && r.data.old; if (old) { try { await sb.storage.from('recruit-photos').remove([old]); } catch (e) { /* harmless */ } delete PHOTO[old]; }
      p.photo = null; if (dlg().open && photoFor === String(p.id)) { closeDlg(); photoFor = null; } render(); toast('Photo removed. Back to initials.');
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  // bulk: each file is matched to a person by its name without the extension: their Instagram handle (ar.lashes_.jpg) or their full name (Radia Nouiri.jpg)
  function normKey(x) { return String(x || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/^@/, '').replace(/[^a-z0-9]/g, ''); }
  function pickBulk() {
    var el = fileInput(true);
    el.onchange = function () { if (el.files && el.files.length) addBulk([].slice.call(el.files)); };
    el.click();
  }
  async function addBulk(files) {
    var byIg = {}, byName = {};
    rows.forEach(function (p) {
      var ig = normKey(p.ig_handle), nm = normKey(p.name);
      if (ig) (byIg[ig] = byIg[ig] || []).push(p);
      if (nm) (byName[nm] = byName[nm] || []).push(p);
    });
    var done = 0, bad = [], unmatched = [], several = [];
    toast('Adding ' + files.length + ' photos...');
    for (var i = 0; i < files.length; i++) {
      var f = files[i], k = normKey(f.name), hit = byIg[k] && byIg[k].length === 1 ? byIg[k][0] : (!byIg[k] && byName[k] && byName[k].length === 1 ? byName[k][0] : null);
      if (!hit) { ((byIg[k] && byIg[k].length > 1) || (byName[k] && byName[k].length > 1) ? several : unmatched).push(f.name); continue; }
      try { await savePhoto(hit, f); done++; } catch (e) { console.error(e); bad.push(f.name + ' (' + (e.message || 'failed') + ')'); }
    }
    render();
    var list = function (a, what) { return a.length ? '<p><b>' + a.length + '</b> ' + what + '</p><p class="rct-hint">' + a.map(esc).join(', ') + '</p>' : ''; };
    if (!unmatched.length && !several.length && !bad.length) { toast(done + ' photos added.'); return; }
    openDlg('Photos added: ' + done + ' of ' + files.length,
      list(unmatched, 'did not match anyone. Name the file after their Instagram handle or their full name as shown here.') +
      list(several, 'matched more than one person, so they were left alone.') +
      list(bad, 'did not save.') + '<p><button type="button" class="rct-btn rct-sm rct-pri" data-close>Done</button></p>');
  }
  document.addEventListener('dragover', function (e) { var a = e.target.closest && e.target.closest('[data-act="photo"]'); if (a && main() && main().contains(a) && e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); a.classList.add('rct-drop'); } });
  document.addEventListener('dragleave', function (e) { var a = e.target.closest && e.target.closest('[data-act="photo"]'); if (a) a.classList.remove('rct-drop'); });
  document.addEventListener('drop', function (e) {
    var a = e.target.closest && e.target.closest('[data-act="photo"]'); if (!a || !main() || !main().contains(a)) return;
    a.classList.remove('rct-drop'); e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0], p = personById(a.getAttribute('data-id'));
    if (f && p) addOnePhoto(p, f);
  });

  var TL = [], TLt = null;
  function toastLine(msg) { TL.push(msg); clearTimeout(TLt); TLt = setTimeout(function () { TL = []; }, 9000); toast(TL.join(' ')); }
  function toast(msg, undo) {
    var host = document.getElementById('rctToast');
    if (!host) { host = document.createElement('div'); host.id = 'rctToast'; document.body.appendChild(host); }
    host.innerHTML = '<div class="rct-toast" role="status"><span>' + esc(msg) + '</span>' + (undo ? '<button type="button" data-undo>Undo</button>' : '') + '</div>';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { host.innerHTML = ''; }, 7000);
  }
  async function setStage(ids, stage, msg) {
    var prev = ids.map(function (id) { var p = personById(id); return { id: id, stage: p ? p.stage : 'new', by: p ? p.decided_by : null, at: p ? p.decided_at : null }; });
    try {
      var r = await rpcEdit('recruit_set_stage', { p_ids: ids, p_stage: stage });
      if (r.error) throw new Error(r.error.message);
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); return false; }
    var now = new Date().toISOString();
    ids.forEach(function (id) { var p = personById(id); if (p) { p.stage = stage; p.decided_by = stage === 'new' ? null : me; p.decided_at = stage === 'new' ? null : now; } });
    UNDO.push(prev); render();
    if (msg) toast(msg, true);
    return true;
  }
  // Kate, 16 Nov 2026: Shortlist on a support-staff applicant (not a stylist or beautician) also tells the interviewers (ate Jho and ate Frans) on WhatsApp, from the main number,
  // through the staff WhatsApp queue (migrations/recruit_shortlist_notify.sql). It never blocks the Shortlist itself, and the database sends it once per person.
  // Kate, 16 Nov 2026: ate Jho and ate Frans interview the support roles (front desk, reception, assistants and any other staff type); Coach Emma interviews stylists and beauticians herself,
  // so those get no WhatsApp. The roles are the setting notify_roles (the database checks the same list); Not stated is left out on purpose.
  function notifyRole(r) { var l = setting('notify_roles', ['Front Desk / Reception', 'Hair Assistant', 'Other', 'Beautician']); return l.indexOf(r) >= 0; }
  // Kate, 18 Nov 2026 ("add emma to all hairdresser applications"): a Shortlist on a Hairdresser / Hair Stylist also WhatsApps Coach Emma only (settings notify_emma_roles and notify_emma_ids;
  // the database picks the people from the role, migrations/recruit_emma_hairdresser_wa_18nov.sql). ate Jho and ate Frances do not get the stylists.
  function emmaRole(r) { var l = setting('notify_emma_roles', ['Hairdresser / Hair Stylist']); return l.indexOf(r) >= 0; }
  async function notifyShortlist(id) {
    var p = personById(id); if (!p || !(p.is_test || ((notifyRole(roleGroup(p)) || emmaRole(roleGroup(p))) && setting('notify_enabled', false)))) return;
    try {
      var r = await sb.rpc('recruit_shortlist_notify', { p_id: p.id, p_role: roleGroup(p) });
      if (r.error) throw new Error(r.error.message);
      var d = r.data || {}, who = (d.names || []).join(' and ');
      if (d.test) { toastLine('Test sent to your own number' + (d.mode === 'text' ? ', as plain text (Meta has not approved the template yet, so it only arrives if you wrote to the main number in the last 24 hours).' : '.')); return; }
      if (d.queued) toastLine(who + ' will get the WhatsApp to interview ' + firstName(p.name) + (d.sends_now ? ' now.' : ' from ' + (d.hour_from || 9) + ':00 in the morning (Dubai).'));
      else if ((d.skipped || []).length && d.skipped.every(function (x) { return x.reason === 'already told'; })) toastLine('The interviewers were already told about ' + firstName(p.name) + '.');
      else if (d.reason === 'template_not_approved') toastLine('Shortlisted. The WhatsApp to the interviewers did not go: the message is not approved by Meta yet.');
      else if (d.reason && d.reason !== 'role' && d.reason !== 'off') toastLine('Shortlisted. The WhatsApp to the interviewers did not go (' + d.reason.replace(/_/g, ' ') + ').');
      else if ((d.skipped || []).length) toastLine('Shortlisted. WhatsApp did not go to ' + d.skipped.map(function (x) { return x.name + ' (' + x.reason + ')'; }).join(', ') + '.');
    } catch (e) { console.error(e); toastLine('Shortlisted, but the WhatsApp to the interviewers did not go: ' + (e.message || 'try again')); }
  }
  async function emailShortlist(id) {
    var p = personById(id); if (!p || !(p.is_test || (setting('shortlist_email_enabled', false) && notifyRole(roleGroup(p))))) return;
    if (!p.is_test && (!p.email || p.bounced)) { toastLine(p.bounced ? 'No automatic email: their address bounced.' : 'No automatic email: no email address.'); return; }
    try {
      var rp = shortlistEmailParts(p);
      var r = await sb.rpc('recruit_queue_email', { p_id: p.id, p_role: roleGroup(p), p_subject: rp.subject, p_html: rp.html, p_text: rp.textFull || rp.text });
      if (r.error) throw new Error(r.error.message);
      var d = r.data || {};
      if (d.queued && d.test) toastLine('A test of the applicant email goes to your own address within 5 minutes.');
      else if (d.queued) toastLine(firstName(p.name) + ' will get the automatic email from the recruitment inbox within 5 minutes.');
      else if (d.reason === 'already_emailed') toastLine(firstName(p.name) + ' was already sent the automatic email.');
      else if (d.reason === 'no_email' || d.reason === 'bounced') toastLine('No automatic email: ' + (d.reason === 'bounced' ? 'their address bounced.' : 'no email address.'));
    } catch (e) { console.error(e); toastLine('The automatic email did not queue: ' + (e.message || 'try again')); }
  }
  // Offer -> Hired: the starting date is finalised here (recruit_set_hired, migrations/recruit_hire.sql).
  function hireDialog(id) {
    var p = personById(id); if (!p) return;
    openDlg('Hire ' + esc(firstName(p.name)),
      '<p>Once the offer letter is agreed, put in the starting date and mark ' + esc(firstName(p.name)) + ' as hired.</p>' +
      '<label class="rct-field"><span>Starting date</span><input type="date" id="rctStart" value="' + esc(String(p.start_date || '').slice(0, 10)) + '"></label>' +
      '<p class="rct-amberbox" id="rctStartSay" hidden></p>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="hiresave" data-id="' + esc(p.id) + '">Mark as hired</button><button type="button" class="rct-btn" data-close>Cancel</button></div>' +
      '<p class="rct-hint">The dashboard does not send the offer letter. This only records the date and moves them to Hired.</p>');
  }
  async function hireSave(id) {
    var p = personById(id), inp = document.getElementById('rctStart'), say = document.getElementById('rctStartSay'); if (!p || !inp) return;
    if (!inp.value) { if (say) { say.hidden = false; say.textContent = 'Pick the starting date first.'; } return; }
    try {
      var r = await rpcEdit('recruit_set_hired', { p_id: p.id, p_start: inp.value }); if (r.error) throw new Error(r.error.message);
    } catch (e) { console.error(e); if (say) { say.hidden = false; say.textContent = 'That did not save: ' + (e.message || 'try again'); } return; }
    p.stage = 'hired'; p.start_date = inp.value; p.decided_by = me; p.decided_at = new Date().toISOString();
    closeDlg(); render(); toast(firstName(p.name) + ' is hired, starting ' + fdate(inp.value) + '.');
  }

  /* ---------- hiring steps (Kate, 16 Nov 2026) ----------
     Each step has its own email, shown as a draft to copy or open in Gmail (nothing is sent by the page; only the Shortlist email is automatic). The wording is a draft until it has
     passed /brand-review. {greeting} is the Hi line, {details} the trade test note, {startdate} the start date, [Confirm my start date]({accept_url}) the applicant's own accept link. */
  var PIPE = {
    screening:      { pair: 1, next: [['interview_pass', 'Interview passed', 1], ['interview_fail', 'Interview not passed']] },
    interview_pass: { next: [['trade_test', 'Trade test scheduled', 1]] },
    trade_test:     { pair: 1, next: [['trade_pass', 'Trade test passed', 1], ['trade_fail', 'Trade test not passed']] },
    trade_pass:     { next: [['offer_to_send', 'For offer letter', 1]] },
    offer_to_send:  { next: [['offer_sent', 'Offer letter sent', 1]] },
    offer_sent:     { next: [['start_pending', 'Set start date', 1]] },
    start_pending:  { next: [['start_accepted', 'They accepted']] },
    start_accepted: { next: [['hired', 'Mark as hired']] },
    hired:          { next: [] },
    interview_fail: { next: [], reopen: 1 },
    trade_fail:     { next: [], reopen: 1 }
  };
  PIPE.offer = PIPE.offer_to_send;
  var FAIL_LINK = '[careers page]({careers_url})';
  var PE = {
    interview_pass: { subject: 'Your interview with Tara Rose Salons',
      body: '{greeting}\n\nThank you for taking the time to speak with our team. We enjoyed meeting you, and we would like to take you to the next step.\n\nThat is a trade test, so we can see you work and you can see how we work. We will be in touch soon with the day, the time and the salon.\n\nIf anything changes on your side before then, just reply to this email.' },
    interview_fail: { subject: 'An update on your interview with Tara Rose Salons',
      body: '{greeting}\n\nThank you for speaking with our team about joining Tara Rose Salons. We gave your interview careful thought, and we would rather give you a clear answer than leave you waiting.\n\n**We will not be taking things further at this time.**\n\nWe know this is not the news you were hoping for, and we are grateful for the time you gave us. We wish you every success. If another role comes up that suits you, we would love you to talk to us again through our ' + FAIL_LINK + '.' },
    trade_test: { subject: 'Your trade test at Tara Rose Salons',
      body: '{greeting}\n\nYour trade test is booked: **{details}**.\n\nIt is a practical session with our team, so we can see how you work and you can get a feel for our salon.\n\nIf you cannot make it, reply to this email as soon as you can and we will talk it through.' },
    trade_fail: { subject: 'An update on your trade test at Tara Rose Salons',
      body: '{greeting}\n\nThank you for spending your trade test with our team. We gave it careful thought, and we would rather give you a clear answer than leave you waiting.\n\n**We will not be taking things further at this time.**\n\nWe know this is not the news you were hoping for, and we are grateful for the time you gave us. We wish you every success. If another role comes up that suits you, we would love you to talk to us again through our ' + FAIL_LINK + '.' },
    trade_pass: { subject: 'Your trade test at Tara Rose Salons',
      body: '{greeting}\n\nThank you for your trade test. It went well, and we would like you to join the Tara Rose team.\n\nWe will send your offer letter shortly. If you have any questions before then, just reply to this email.' },
    offer_to_send: { subject: 'Your offer letter from Tara Rose Salons',
      body: '{greeting}\n\nWe are putting your offer letter together now, and it will reach you soon.\n\nIf you have any questions in the meantime, just reply to this email.' },
    offer_sent: { subject: 'Your offer letter from Tara Rose Salons',
      body: '{greeting}\n\nWe have sent your offer letter. Please read it through, and reply to this email with any questions.\n\nOnce you have had a chance to read it, we will be in touch about your start date.' },
    start_pending: { subject: 'Your start date at Tara Rose Salons',
      body: '{greeting}\n\nWe would love you to start on **{startdate}**.\n\nPlease confirm the date works for you: [Confirm my start date]({accept_url})\n\nIf that date does not suit you, reply to this email and we will talk it through.' },
    start_accepted: { subject: 'Your start date at Tara Rose Salons',
      body: '{greeting}\n\nThank you for confirming. We have your start date as **{startdate}**, and we are looking forward to welcoming you.\n\nIf anything changes before then, just reply to this email.' },
    hired: { subject: 'Welcome to Tara Rose Salons',
      body: '{greeting}\n\nWelcome to the Tara Rose team. We are so glad you are here.\n\nIf you need anything, reply to this email and we will help.' }
  };
  var ACCEPT = {};   // person id -> their accept link, filled by acceptUrl()
  function stageEmailParts(p, to) {
    var e = PE[to]; if (!e) return null;
    var url = ACCEPT[p.id] || '', body = e.body.replace(/\{details\}/g, String(p.stage_note || '').trim() || 'details to follow').replace(/\{startdate\}/g, p.start_date ? fdate(p.start_date) : 'a date to follow').replace(/\{accept_url\}/g, url || 'https://trk-salon-os.com/');
    var rp = replyParts(p, false, null, body + '\n\nWarm regards,', e.subject, { html: SL_SIG_HTML, text: SL_SIG_TEXT });
    if (url) { rp.text = rp.text.replace('Confirm my start date', 'Confirm my start date: ' + url); rp.textFull = rp.textFull.replace('Confirm my start date', 'Confirm my start date: ' + url); }
    return rp;
  }
  async function acceptUrl(p) {
    if (ACCEPT[p.id]) return ACCEPT[p.id];
    var r = await sb.rpc('recruit_accept_link', { p_id: p.id }); if (r.error) throw new Error(r.error.message);
    ACCEPT[p.id] = 'https://trk-salon-os.com/accept/?t=' + encodeURIComponent(r.data); return ACCEPT[p.id];
  }
  function stageEmailDialog(p, to, lead) {
    var rp = stageEmailParts(p, to); if (!rp) return;
    var canMail = !!p.email && !p.bounced;
    openDlg(esc(STAGE_LABEL[to]) + ': email for ' + esc(firstName(p.name)),
      '<p>' + lead + ' Nothing has been sent. Copy the email into a new message from the recruitment inbox, or open Gmail with the address and subject ready.</p>' +
      (p.bounced ? '<p class="rct-amberbox">Their email bounced. Message them on WhatsApp instead.</p>' : (!p.email ? '<p class="rct-amberbox">No email address on file.</p>' : '')) +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="copyst" data-to="' + esc(to) + '" data-id="' + esc(p.id) + '">Copy reply</button>' +
      (canMail ? '<a class="rct-btn" href="' + esc(gmailUrl(p.email, rp.subject)) + '" target="_blank" rel="noopener">Open in Gmail</a>' : '<button type="button" class="rct-btn" disabled>Open in Gmail</button>') + '</div>' +
      '<div><div class="rct-lab">How the email looks</div>' + previewFrame(rp.html) + '</div>' +
      '<p class="rct-hint">Copy reply pastes with the formatting into Gmail. Sending stays your click.</p>');
  }
  async function showStageEmail(id, to, lead) {
    var p = personById(id); if (!p || !PE[to]) return;
    try { if (to === 'start_pending') await acceptUrl(p); } catch (e) { console.error(e); toast('The accept link did not load: ' + (e.message || 'try again')); return; }
    stageEmailDialog(p, to, lead || 'This is the email for <b>' + esc(STAGE_LABEL[to]) + '</b>.');
  }
  // Kate, 17 Nov 2026 ("super bagal i click. pls fix"): with 100 rows the page had about 370 <select> boxes, and the site's pill-select script rebuilt every one of them (a button, a menu
  // watcher and a layout read each) after every click, so one click took 2 to 3.5 seconds. These four dropdowns are now drawn directly as the same pill button the site draws, carrying only the
  // chosen label; the list of choices is built when the button is pressed. Same look, same choices, same actions.
  var DD_CHEV = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function ddInfo(kind, p) {
    var nm = esc(p.name || 'this person');
    if (kind === 'ss') { var s = statusInfo(p); return { cur: s.cur, opts: s.opts, label: 'Change the status of ' + nm }; }
    if (kind === 'rs') {
      var ar = autoRole(p);
      return { cur: p.role_set || 'auto', label: 'Applying for, ' + nm,
        opts: [['auto', ar === 'Not stated' ? 'Not stated (set it)' : ar + ' (automatic)']].concat(ROLE_CHOICES.map(function (x) { return [x, x]; })) };
    }
    if (kind === 'pl') return { cur: p.pref_loc || '', label: 'Preferred location of ' + nm, title: p.pref_src ? 'From: ' + p.pref_src : 'Not stated. Pick one if you know.',
      opts: [['', 'Not stated'], ['Dubai', 'Dubai'], ['Abu Dhabi', 'Abu Dhabi'], ['Either', 'Either (Dubai or Abu Dhabi)']] };
    var ab = autoBucket(p);   // 'bk': Worth a look or Probably no, for a person at New
    return { cur: p.is_test ? 'test' : p.look_ok ? 'look' : p.no_ok ? 'no' : 'auto', label: 'Worth a look or Probably no for ' + nm,
      opts: [['auto', 'Automatic: ' + (ab === 'look' ? 'Worth a look' : 'Probably no')], ['look', 'Worth a look, by hand'], ['no', 'Probably no, by hand'], ['test', 'Test, messages only to you']] };
  }
  function lazyDD(kind, p) {
    var f = ddInfo(kind, p), hit = f.opts.filter(function (o) { return o[0] === f.cur; })[0] || f.opts[0];
    return '<span class="ps rct-dd"><button type="button" class="ps-btn' + (kind === 'pl' && !f.cur ? ' rct-prefnone' : '') + '" data-dd="' + kind + '" data-id="' + esc(p.id) + '" aria-haspopup="listbox" aria-expanded="false" aria-label="' + f.label + '"' +
      (f.title ? ' title="' + esc(f.title) + '"' : '') + '><span>' + esc(hit ? hit[1] : '') + '</span>' + DD_CHEV + '</button></span>';
  }
  var ddOpen = null;
  function ddClose(refocus) {
    if (!ddOpen) return;
    var o = ddOpen; ddOpen = null;
    if (o.menu.parentNode) o.menu.remove();
    o.wrap.classList.remove('open'); o.btn.setAttribute('aria-expanded', 'false');
    if (refocus && o.btn.isConnected) o.btn.focus();
  }
  function ddPick(kind, id, v) {
    if (kind === 'ss') changeStatus(id, v); else if (kind === 'rs') setRole(id, v); else if (kind === 'pl') setPref(id, v); else setBucket(id, v);
  }
  function ddToggle(btn) {
    if (ddOpen && ddOpen.btn === btn) { ddClose(true); return; }
    ddClose();
    var kind = btn.getAttribute('data-dd'), id = btn.getAttribute('data-id'), p = personById(id); if (!p) return;
    var f = ddInfo(kind, p), wrap = btn.parentNode, menu = document.createElement('div');
    menu.className = 'ps-menu'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', btn.getAttribute('aria-label') || '');
    menu.innerHTML = f.opts.map(function (o) { return '<button type="button" role="option" data-v="' + esc(o[0]) + '" aria-selected="' + (o[0] === f.cur) + '"' + (o[0] === f.cur ? ' class="on"' : '') + '>' + esc(o[1]) + '</button>'; }).join('');
    wrap.appendChild(menu); wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    var r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    menu.style.minWidth = Math.round(r.width) + 'px'; menu.style.maxWidth = (vw - 16) + 'px';
    var below = vh - r.bottom - 12, above = r.top - 12, up = below < Math.min(menu.scrollHeight, 220) && above > below;
    menu.style.maxHeight = Math.max(140, Math.min(320, up ? above : below)) + 'px';
    var mw = menu.offsetWidth, mh = menu.offsetHeight, top = up ? r.top - 6 - mh : r.bottom + 6, left = r.left;
    if (left + mw > vw - 8) left = Math.max(8, r.right - mw);
    menu.style.top = top + 'px'; menu.style.left = left + 'px';
    var m = menu.getBoundingClientRect();   // inside a transformed box "fixed" is measured from that box: nudge so the list still sits on its button
    if (Math.abs(m.top - top) > 1 || Math.abs(m.left - left) > 1) { menu.style.top = (2 * top - m.top) + 'px'; menu.style.left = (2 * left - m.left) + 'px'; }
    var on = menu.querySelector('button.on') || menu.querySelector('button');
    if (on) { menu.scrollTop = Math.max(0, on.offsetTop - menu.clientHeight / 2); on.focus({ preventScroll: true }); }
    ddOpen = { btn: btn, wrap: wrap, menu: menu };
    menu.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-v]'); if (!b) return;
      e.stopPropagation(); var v = b.getAttribute('data-v'); ddClose(true);
      if (v !== f.cur) ddPick(kind, id, v);
    });
    menu.addEventListener('keydown', function (e) {
      var bs = [].slice.call(menu.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); ddClose(true); }
      else if (e.key === 'Tab') ddClose();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); var n = bs[e.key === 'ArrowDown' ? Math.min(i + 1, bs.length - 1) : Math.max(i - 1, 0)]; if (n) n.focus(); }
    });
  }
  if (!window.__rctDD) {
    window.__rctDD = true;
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-dd]');
      if (b) { e.stopPropagation(); ddToggle(b); return; }
      if (ddOpen && !ddOpen.wrap.contains(e.target)) ddClose();
    }, true);
    window.addEventListener('scroll', function (e) { if (ddOpen && !(e.target.closest && e.target.closest('.ps-menu'))) ddClose(); }, true);
    window.addEventListener('resize', function () { ddClose(); });
  }
  // Kate, 17 Nov 2026 ("add bulk actions pls kasi may mga i aassign na ko kay ate frans and ate jho"): tick people in the List (shift-click ticks a run), and a bar at the bottom offers Assign to
  // (Kate gives people to ate Jho, ate Frances or herself; everyone else can only take unassigned people for themselves), Let go, Status and Preferred location for all of them at once.
  // A status set in bulk sends no emails (use the envelope on a person for that). The ticks stay while you filter and page; Clear removes them.
  var SEL = {}, lastSel = -1;
  function selIds() { var ok = {}; rows.forEach(function (p) { ok[p.id] = 1; }); return Object.keys(SEL).filter(function (id) { return ok[id]; }); }
  var BULK_STATUS = [['interview_pass', 'Interview: pass'], ['interview_fail', 'Interview: fail'], ['trade_pass', 'Trade test: pass'], ['trade_fail', 'Trade test: fail'], ['offer_to_send', 'Offer letter: to send'],
    ['offer_sent', 'Offer letter: sent'], ['start_accepted', 'Start date: accepted'], ['hired', 'Hired'], ['not_now', 'Not now'], ['new', 'Back to New']];
  function bulkBarHtml() {
    var ids = selIds(); if (!ids.length) return '';
    var team = (C && C.team) || [], isOwner = (C && C.my_level) >= 5, h = '<div class="rct-bulk" role="region" aria-label="Bulk actions"><b>' + ids.length + ' selected</b>' +
      '<button type="button" class="rct-linkbtn" data-act="selpage">This page</button><button type="button" class="rct-linkbtn" data-act="selall">All ' + listRows().length + ' shown</button><span class="rct-bsep"></span><span class="rct-bl">Assign to</span>';
    var mine = team.filter(function (u) { return u.name === me; })[0];
    (isOwner ? team : (mine ? [mine] : [])).forEach(function (u) {
      h += '<button type="button" class="rct-btn rct-sm' + (u.name === me ? ' rct-pri' : '') + '" data-act="bassign" data-to="' + esc(u.email) + '">' + (u.name === me ? 'Me' : esc(firstName(u.name))) + '</button>';
    });
    h += '<button type="button" class="rct-btn rct-sm" data-act="bletgo">Let go</button><span class="rct-bsep"></span>' +
      '<select class="rct-bsel" data-bulk="status" aria-label="Set the status of the selected people"><option value="">Status...</option>' + BULK_STATUS.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
      '<select class="rct-bsel" data-bulk="pref" aria-label="Set the preferred location of the selected people"><option value="">Preferred location...</option><option value="Dubai">Dubai</option><option value="Abu Dhabi">Abu Dhabi</option><option value="Either">Either</option><option value="-">Not stated</option></select>' +
      '<span class="rct-bsep"></span><button type="button" class="rct-linkbtn" data-act="bclear">Clear</button></div>';
    return h;
  }
  // the ticks changed: redraw only the bar and the boxes, not the whole table
  function bulkRefresh() {
    var m = main(); if (!m) return;
    [].forEach.call(m.querySelectorAll('input[data-sel]'), function (c) { c.checked = !!SEL[c.getAttribute('data-sel')]; });
    var old = m.querySelector('.rct-bulk'); if (old) old.remove();
    var html = bulkBarHtml(); if (html) m.insertAdjacentHTML('beforeend', html);
  }
  function bulkTick(cb, shift) {
    var id = cb.getAttribute('data-sel'), boxes = [].slice.call(main().querySelectorAll('input[data-sel]')), i = boxes.indexOf(cb);
    if (shift && lastSel >= 0 && lastSel < boxes.length) {
      var lo = Math.min(lastSel, i), hi = Math.max(lastSel, i);
      for (var k = lo; k <= hi; k++) { var kid = boxes[k].getAttribute('data-sel'); if (cb.checked) SEL[kid] = 1; else delete SEL[kid]; }
    } else if (cb.checked) SEL[id] = 1; else delete SEL[id];
    lastSel = i; bulkRefresh();
  }
  function bulkDone(msg) { SEL = {}; lastSel = -1; toast(msg); return window.renderRecruitment(); }
  async function bulkAssign(toEmail) {
    var ids = selIds(); if (!ids.length) return;
    var u = ((C && C.team) || []).filter(function (x) { return x.email === toEmail; })[0], self = !u || u.name === me;
    try {
      var r = await sb.rpc('recruit_assign_many', { p_ids: ids, p_to: self ? null : toEmail, p_take: true }); if (r.error) throw new Error(r.error.message);
      var d = r.data || {}, who = self ? 'you' : firstName(u.name);
      var wa = d.changed ? await claimWhatsApp(self ? null : toEmail, d.changed, null, null) : '';
      await bulkDone((d.changed || 0) + ' assigned to ' + who + (d.skipped ? '. ' + d.skipped + ' already held by someone else, left alone' : '') + (d.changed ? '. The others have been told.' : '.') + wa);
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  async function bulkLetGo() {
    var ids = selIds(); if (!ids.length) return;
    try {
      var r = await sb.rpc('recruit_assign_many', { p_ids: ids, p_to: null, p_take: false }); if (r.error) throw new Error(r.error.message);
      var d = r.data || {};
      await bulkDone((d.changed || 0) + ' let go' + (d.skipped ? '. ' + d.skipped + ' were not assigned to you, left alone.' : '.'));
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  async function bulkPref(v) {
    var ids = selIds(); if (!ids.length) return;
    try {
      var r = await sb.rpc('recruit_set_pref_many', { p_ids: ids, p_loc: v === '-' ? null : v }); if (r.error) throw new Error(r.error.message);
      await bulkDone((r.data && r.data.changed || 0) + ' set to ' + (v === '-' ? 'Not stated' : v) + '.');
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  function bulkStatusAsk(v) {
    var ids = selIds(); if (!ids.length) return;
    var lab = (BULK_STATUS.filter(function (o) { return o[0] === v; })[0] || [v, v])[1];
    openDlg('Set ' + ids.length + ' people to ' + esc(lab),
      '<p>Everyone selected moves to <b>' + esc(lab) + '</b>. No emails are sent (use the envelope on a person to send one). You can undo it from the message that appears.</p>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="bstatusok" data-to="' + esc(v) + '">Set ' + ids.length + ' people</button><button type="button" class="rct-btn" data-close>Cancel</button></div>');
  }
  async function bulkStatusDo(v) {
    var ids = selIds(); if (!ids.length) return; closeDlg();
    var lab = (BULK_STATUS.filter(function (o) { return o[0] === v; })[0] || [v, v])[1];
    var ok = await setStage(ids, v, ids.length + ' people are now: ' + lab + '.');
    if (ok) { SEL = {}; lastSel = -1; render(); }
  }
  // Kate, 17 Nov 2026 ("add assign to self button pala, kasi baka mag unahan ate jho at ate frances sa pag tingin ng applicants ... pag napindot na nung isa, mag notify samin lahat real time"):
  // Assign to me takes a person. The database refuses a second person (and says who has them), writes the claim into the history, and puts a popup notice on the bell of everyone else who
  // can open Recruitment, on whatever page of the dashboard they are. The bell and this page both listen for it live (site_notice_ping), so nobody waits for a refresh.
  // Kate, 17 Nov 2026 ("to notify through whatsapp"): after an assign the OTHER interviewers also get a WhatsApp from the main number (migrations/recruit_wa_claim_reminder_17nov.sql),
  // through the staff WhatsApp queue. Off until the setting claim_wa_enabled is true and Meta has approved the template. It never blocks the assign: this only returns a sentence for the toast.
  async function claimWhatsApp(holderEmail, n, label, id) {
    if (!n || !setting('claim_wa_enabled', false)) return '';
    try {
      var r = await sb.rpc('recruit_claim_notify', { p_holder_email: holderEmail || null, p_count: n, p_label: label || null, p_id: id || null });
      if (r.error) throw new Error(r.error.message);
      var d = r.data || {};
      if (d.queued) return ' ' + (d.names || []).join(' and ') + ' will also get a WhatsApp' + (d.sends_now ? ' now.' : ' from ' + (d.hour_from || 9) + ':00 in the morning (Dubai).');
      if (d.reason === 'template_not_approved') return ' The WhatsApp did not go: the message is not approved by Meta yet.';
      if (d.reason && d.reason !== 'off' && d.reason !== 'nothing') return ' The WhatsApp did not go (' + String(d.reason).replace(/_/g, ' ') + ').';
      return '';
    } catch (e) { console.error(e); return ' The WhatsApp did not go: ' + (e.message || 'try again') + '.'; }
  }
  function asgHtml(p) {
    var id = esc(p.id);
    if (!p.assigned_to) return '<button type="button" class="rct-asg" data-act="assign" data-id="' + id + '" title="Take this person so the others know you are on them">Assign to me</button>';
    if (p.assigned_mine) return '<span class="rct-asgpill rct-asgme">Yours</span><button type="button" class="rct-linkbtn rct-asgx" data-act="unassign" data-id="' + id + '">Let go</button>';
    return '<span class="rct-asgpill" title="Taken ' + esc(fat(p.assigned_at)) + '">With ' + esc(firstName(p.assigned_to)) + '</span><button type="button" class="rct-linkbtn rct-asgx" data-act="takeover" data-id="' + id + '">Take over</button>';
  }
  async function assignTo(id, force) {
    var p = personById(id); if (!p) return;
    try {
      var r = await sb.rpc('recruit_assign', { p_id: p.id, p_take: true, p_force: !!force }); if (r.error) throw new Error(r.error.message);
      var d = r.data || {};
      if (force) closeDlg();
      if (d.ok) {
        p.assigned_to = me; p.assigned_mine = true; p.assigned_at = new Date().toISOString(); render();
        var wa = d.already ? '' : await claimWhatsApp(null, 1, p.name, p.id);
        toast(d.already ? firstName(p.name) + ' is already yours.' : firstName(p.name) + ' is yours now. The others have been told.' + wa);
      } else {
        p.assigned_to = d.taken_by || p.assigned_to; p.assigned_mine = false; p.assigned_at = d.at || p.assigned_at; render();
        toast(firstName(d.taken_by || 'Someone') + ' already took ' + firstName(p.name) + '.');
      }
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  async function assignLet(id) {
    var p = personById(id); if (!p) return;
    try {
      var r = await sb.rpc('recruit_assign', { p_id: p.id, p_take: false, p_force: false }); if (r.error) throw new Error(r.error.message);
      if (r.data && r.data.ok) { p.assigned_to = null; p.assigned_mine = false; p.assigned_at = null; render(); toast(firstName(p.name) + ' is free again.'); }
      else { toast('Only ' + firstName((r.data && r.data.taken_by) || 'the person who took them') + ' can let go of ' + firstName(p.name) + '.'); }
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); }
  }
  function takeoverAsk(id) {
    var p = personById(id); if (!p) return;
    openDlg('Take over ' + esc(firstName(p.name)),
      '<p>' + esc(firstName(p.assigned_to)) + ' took ' + esc(firstName(p.name)) + (p.assigned_at ? ' on ' + esc(fat(p.assigned_at)) : '') + '. If you take over, ' + esc(firstName(p.assigned_to)) + ' and the others are told.</p>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="takeoverok" data-id="' + esc(p.id) + '">Take over</button><button type="button" class="rct-btn" data-close>Cancel</button></div>');
  }
  // live: someone claimed a person (a row in site_notice_ping), so read the list again unless the reader is typing or a popup is open
  var liveOn = false, liveT = 0;
  function liveStart() {
    if (liveOn || typeof sb === 'undefined' || !sb || typeof sb.channel !== 'function') return; liveOn = true;
    try {
      sb.channel('trs-recruit-live').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'site_notice_ping' }, function () {
        clearTimeout(liveT);
        liveT = setTimeout(function () {
          var m = main(); if (!m || m.offsetParent === null) return;
          var ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && m.contains(ae)) return;
          if (dlg().open) return;
          window.renderRecruitment();
        }, 500);
      }).subscribe();
    } catch (e) { liveOn = false; }
  }
  // Kate, 17 Nov 2026 ("we should also add another column for preferred loc if abu dhabi or dubai"; the 11am meeting: an address can say Abu Dhabi while the role is in Dubai): which emirate the
  // person wants to work in. It is read from what they wrote and from their CV (the dropdown says which), and a person can set it by hand; a hand-set value is never replaced by a reading.
  var PREF_LIST = ['Dubai', 'Abu Dhabi', 'Either'];
  function prefLabel(p) { return p.pref_loc || 'Not stated'; }
  function prefSelect(p) { return lazyDD('pl', p) + (p.pref_src && p.pref_loc ? '<div class="rct-why">' + esc(p.pref_src) + '</div>' : ''); }
  async function setPref(id, v) {
    var p = personById(id); if (!p) return;
    try {
      var r = await rpcEdit('recruit_set_pref', { p_id: p.id, p_loc: v || null }); if (r.error) throw new Error(r.error.message);
      p.pref_loc = v || null; p.pref_src = v ? 'By hand' : null; render();
      toast(v ? firstName(p.name) + ': preferred location is ' + v + '.' : firstName(p.name) + ': preferred location cleared.');
    } catch (e) { console.error(e); render(); toast('That did not save: ' + (e.message || 'try again')); }
  }
  // Kate, 17 Nov 2026 ("patingin ako ng email formats ng lahat ng to ... dapat nakikita rin sya sa recruitment page, listed"): every email the page can send or copy, one after the other in hiring
  // order, with the subject, when it goes out, the words, and how the formatted email looks. Built from the SAME text the buttons use (PE, SL_BODY, the saved No wording), so this list can
  // never drift from what a person really gets. The person in it is a sample, nothing is sent and nothing is saved.
  function emailFormatsDialog() {
    var sp = { id: '__sample', name: 'Aisha Khan', stage_note: 'Tuesday 24 Nov, 10:00 at Saadiyat', start_date: '2026-12-01', email: '', bounced: false };
    ACCEPT.__sample = 'https://trk-salon-os.com/accept/?t=example';
    var HAND = 'By hand: the envelope next to this status in the table opens it, ready to copy into Gmail.';
    var list = [
      { t: 'Shortlisted', when: 'By itself, from the recruitment inbox, when ate Jho or ate Frances shortlists a Front Desk / Reception, Hair Assistant, Beautician or Other applicant (once the automatic email is switched on). Stylists get the invite from Booking link and replies instead.', rp: shortlistEmailParts(sp) },
      { t: 'Interview: pass', when: HAND, rp: stageEmailParts(sp, 'interview_pass') },
      { t: 'Interview: fail', when: HAND, rp: stageEmailParts(sp, 'interview_fail') },
      { t: 'Trade test: scheduled', when: HAND + ' The day, time and salon are what you type when you set the trade test.', rp: stageEmailParts(sp, 'trade_test') },
      { t: 'Trade test: pass', when: HAND, rp: stageEmailParts(sp, 'trade_pass') },
      { t: 'Trade test: fail', when: HAND, rp: stageEmailParts(sp, 'trade_fail') },
      { t: 'Offer letter: to send', when: HAND, rp: stageEmailParts(sp, 'offer_to_send') },
      { t: 'Offer letter: sent', when: HAND, rp: stageEmailParts(sp, 'offer_sent') },
      { t: 'Start date: pending', when: HAND + ' It carries a button the person presses to confirm the date.', rp: stageEmailParts(sp, 'start_pending') },
      { t: 'Start date: accepted', when: HAND, rp: stageEmailParts(sp, 'start_accepted') },
      { t: 'Hired', when: HAND, rp: stageEmailParts(sp, 'hired') },
      { t: 'Not now / Rejected (the No reply)', nav: 'No reply', when: 'By hand: the Reply button on a Not now or Rejected person, or No for the group. The wording is the one saved in Booking link and replies.', rp: replyParts(sp, false) }
    ];
    var intro = '<p class="rct-hint">These are the emails the page uses, in hiring order. The person here is a sample (Aisha Khan). Nothing is sent from this list. To change the Shortlisted invite for stylists or the No wording, use Booking link and replies.</p>';
    // Kate, 17 Nov 2026 ("a small sidebar navi sa gilid so we can easily navigate each type"): a narrow list on the left stays in view while the emails scroll; a click jumps to that email and the one being read is marked.
    var nav = '<nav class="rct-efnav" aria-label="Jump to an email">', body = '';
    list.forEach(function (x, i) {
      var rp = x.rp; if (!rp) return;
      nav += '<button type="button" data-efgo="' + i + '"' + (i === 0 ? ' class="rct-efon"' : '') + '><span>' + (i + 1) + '</span>' + esc(x.nav || x.t) + '</button>';
      body += '<section class="rct-ef" id="rctEf' + i + '" data-ef="' + i + '"><h3>' + (i + 1) + '. ' + esc(x.t) + '</h3><p class="rct-hint">' + esc(x.when) + '</p>' +
        '<div class="rct-efsub"><b>Subject:</b> ' + esc(rp.subject) + '</div>' +
        '<pre class="rct-eftext">' + esc(rp.textFull || rp.text) + '</pre>' +
        '<details><summary>How it looks</summary>' + previewFrame(rp.html) + '</details></section>';
    });
    nav += '</nav>';
    openDlg('Email formats', intro + '<div class="rct-efwrap">' + nav + '<div class="rct-efbody">' + body + '</div></div>');
    var d = dlg(); d.classList.add('rct-wide'); d.scrollTop = 0;
    var navEl = d.querySelector('.rct-efnav'), secs = [].slice.call(d.querySelectorAll('.rct-ef'));
    function mark(i) { [].forEach.call(navEl.querySelectorAll('button'), function (b) { b.classList.toggle('rct-efon', b.getAttribute('data-efgo') === String(i)); }); var on = navEl.querySelector('.rct-efon'); if (on && on.scrollIntoView && navEl.scrollWidth > navEl.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    navEl.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-efgo]'); if (!b) return;
      var sec = d.querySelector('#rctEf' + b.getAttribute('data-efgo')); if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); mark(b.getAttribute('data-efgo')); }
    });
    d.onscroll = function () {
      var top = d.getBoundingClientRect().top + 150, cur = 0;
      secs.forEach(function (sc, i) { if (sc.getBoundingClientRect().top <= top) cur = i; });
      mark(cur);
    };
  }
  // Kate, 17 Nov 2026 ("no xlsx and csv buttons for downloads"): the house rule for every report (report-export.js, 10 Nov 2026). Every person the filters, the box picked and the search match, in the
  // order the table shows them, not only the page on screen. Contact details are in the file because the page shows them to the same people.
  function rctExport() {
    var list = sortedRows(listRows()); if (!list.length) return null;
    var T = function (k, l) { return { key: k, label: l, fmt: 'text' }; };
    var cols = [T('st', 'Application status'), T('nm', 'Name'), T('em', 'Email'), T('wa', 'WhatsApp'), T('pl', 'Based in'), T('pf', 'Preferred location'), T('ig', 'Link to work'), T('cv', 'CV'), T('ph', 'Profile photo'),
      T('ex', 'Experience'), T('ro', 'Applying for'), T('et', 'Employment type'), T('ap', 'Applied'), T('sr', 'Came from'), T('wt', 'Days waiting (new, no reply)'), T('s2', 'Worth a look or Probably no'),
      T('as', 'Assigned to'), T('lb', 'Last change by'), T('lw', 'Last change'), T('ld', 'Last change date'), T('rv', 'First looked at by')];
    var d10 = function (iso) { return iso ? String(iso).slice(0, 10) : ''; };
    var rows = list.map(function (p) {
      var le = lastEdit(p), b = bucket(p);
      return { cells: [STAGE_LABEL[p.stage] || p.stage, p.name || 'Name not stated', p.email || '', p.whatsapp || '', placeShort(p), prefLabel(p), igLabel(p), cvLabel(p), photoLabel(p), p.experience || 'Not stated', roleGroup(p), empType(p),
        d10(p.applied_at), srcLabel(p), (p.stage === 'new' && !p.replied_at) ? waited(p) : '', p.stage === 'new' ? (b === 'no' ? 'Probably no' : 'Worth a look') : '',
        p.assigned_to ? firstName(p.assigned_to) : '', le ? firstName(le.by) : '', le ? le.what : '', le ? d10(le.at) : '', p.reviewed_by && p.reviewed_by !== 'earlier decision' ? firstName(p.reviewed_by) : ''] };
    });
    return { name: 'recruitment' + (S.lane ? '-' + S.lane : ''), sheets: [{ name: 'Applicants', title: 'Recruitment', subtitle: rows.length + ' people, with the filters set on the page',
      blocks: [{ cols: cols, rows: rows }],
      legend: [['Application status', 'The step the person is at in the hiring steps.'], ['Last change', 'The last thing anyone changed on that person, and who.'], ['Worth a look or Probably no', 'Only for people still at New.']] }] };
  }
  window.rctExport = rctExport;
  // Kate, 16 Nov 2026 (mock-up option 3, "pangit din tlga layout nung buttons sa status"): the Application Status cell is one tidy block. Top line: the status dropdown and an envelope
  // that opens that step's email. Under it, one clear action: Passed and Not passed side by side at the two decision steps (interview, trade test), one next-step button at every other
  // step, nothing at the end. Going back, Not now and Back to New are in the dropdown.
  var ICON_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function scBtn(cls, act, id, label, to, title) {
    return '<button type="button" class="rct-btn ' + cls + '" data-act="' + act + '" data-id="' + id + '"' + (to ? ' data-to="' + to + '"' : '') + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + '</button>';
  }
  function scTop(p, mail) {
    var key = p.stage === 'offer' ? 'offer_to_send' : p.stage;
    // at Shortlisted the email is the keep-your-line-open one (it goes out by itself when the person is shortlisted; this only shows it again)
    var act = mail && PE[key] ? 'mvmail' : mail && p.stage === 'screening' ? 'short' : '';
    return '<div class="rct-sc-top">' + statusSelect(p) +
      (act ? '<button type="button" class="rct-ico" data-act="' + act + '" data-id="' + esc(p.id) + '" title="Open the email for this step" aria-label="Open the email for this step">' + ICON_MAIL + '</button>' : '') + '</div>';
  }
  function pipeActs(p) {
    var cfg = PIPE[p.stage]; if (!cfg) return '';
    var id = esc(p.id), b = '';
    if (cfg.pair) b = '<div class="rct-sc-pair">' + scBtn('rct-pri', 'mv', id, '&#10003; Passed', cfg.next[0][0], cfg.next[0][1]) + scBtn('rct-no', 'mv', id, '&#10007; Not passed', cfg.next[1][0], cfg.next[1][1]) + '</div>';
    else if (cfg.next.length) b = scBtn('rct-pri', 'mv', id, esc(cfg.next[0][1]) + ' &rarr;', cfg.next[0][0]);
    return '<div class="rct-sc">' + scTop(p, true) + b + '</div>';
  }
  // the same block for the people who are not in the hiring steps yet (New), still at Screening or Interview booked (roles that are not assistants or reception), or Not now
  function sideActs(p) {
    var id = esc(p.id), b = '', top = '';
    if (p.stage === 'new') { top = '<div class="rct-sc-top">' + statusSelect(p) + '</div>'; b = '<div class="rct-sc-pair">' + scBtn('rct-pri', 'short', id, 'Shortlist') + scBtn('rct-no', 'no', id, 'No') + '</div>'; }
    else {
      top = scTop(p, false);
      if (p.stage === 'screening') b = scBtn('rct-pri', 'booked', id, 'Interview booked &rarr;');
      else if (p.stage === 'interview_booked') b = '<div class="rct-sc-pair">' + scBtn('rct-pri', 'passed', id, '&#10003; Passed') + scBtn('rct-no', 'no', id, '&#10007; No') + '</div>';
      else b = scBtn('', 'reply', id, 'Reply');
    }
    return '<div class="rct-sc">' + top + b + '</div>';
  }
  function usesPipe(p) { return !!PIPE[p.stage] && (p.stage !== 'screening' || lineOpenRole(p)); }
  // Kate, 16 Nov 2026 ("i should be able to change statuses beh, make it a drop down"): any status can be set by hand. Going back a step only sets the status (no email is offered, it is
  // a correction); going forward opens that step's email as usual; Trade test scheduled and Set start date still ask for their detail first.
  var SEL_ORDER = ['screening', 'interview_booked', 'interview_pass', 'interview_fail', 'trade_test', 'trade_pass', 'trade_fail', 'offer_to_send', 'offer_sent', 'start_pending', 'start_accepted', 'hired'];
  var STAGE_RANK = { screening: 1, interview_booked: 2, interview_pass: 3, interview_fail: 3, trade_test: 4, trade_pass: 5, trade_fail: 5, offer_to_send: 6, offer_sent: 7, start_pending: 8, start_accepted: 9, hired: 10 };
  // shorter wording inside the dropdown so the chosen status fits the column; the Status column and the emails use the full names
  var SEL_LABEL = { interview_pass: 'Interview: pass', interview_fail: 'Interview: fail', trade_test: 'Trade test: scheduled', trade_pass: 'Trade test: pass', trade_fail: 'Trade test: fail',
    offer_to_send: 'Offer letter: to send', offer_sent: 'Offer letter: sent', start_pending: 'Start date: pending', start_accepted: 'Start date: accepted' };
  function statusInfo(p) {
    var cur = p.stage === 'offer' ? 'offer_to_send' : p.stage;
    var keys = SEL_ORDER.filter(function (k) { return k !== 'interview_booked' || cur === 'interview_booked' || !lineOpenRole(p); });
    // Kate, 17 Nov 2026 ("we should have ability na mag laktaw ng application status ndi yung na stuck sa shortlist"): a person at New can be set straight to any step (a walk-in, a referral, someone
    // already interviewed), so nobody has to be pushed through Shortlisted first. Choosing Shortlisted still runs the normal shortlist steps.
    var extra = cur === 'new' ? [['not_now', 'Not now']] : [['not_now', 'Not now'], ['new', 'Back to New']];
    if (cur === 'rejected') extra.unshift(['rejected', 'Rejected']);
    var opts = keys.map(function (k) { return [k, SEL_LABEL[k] || STAGE_LABEL[k]]; }).concat(extra);
    if (cur === 'new') opts.unshift(['new', 'New: skip ahead to...']);
    return { cur: cur, opts: opts };
  }
  function statusSelect(p) { return lazyDD('ss', p); }
  async function changeStatus(id, to) {
    var p = personById(id); if (!p) return;
    var from = p.stage === 'offer' ? 'offer_to_send' : p.stage; if (to === from || to === 'rejected') { render(); return; }
    if (from === 'new' && to === 'screening') { render(); shortDialog(id); return; }   // Shortlisted from New is the Shortlist button
    if (to === 'new') { await setStage([id], 'new', firstName(p.name) + ' is back in the list.'); return; }
    if (to === 'not_now') { if (await setStage([id], 'not_now', 'Not now for ' + firstName(p.name) + '.')) noDialog(id); return; }
    var quiet = (STAGE_RANK[to] || 0) < (STAGE_RANK[from] || 0);
    await moveTo(id, to, quiet);
    if (to === 'trade_test' || to === 'start_pending') render();   // the dialog is open; until it is saved the list still shows the old status
  }
  async function moveTo(id, to, quiet) {
    var p = personById(id); if (!p) return;
    if (to === 'trade_test' || to === 'start_pending') { moveDialog(id, to, quiet); return; }
    var ok = await setStage([id], to, firstName(p.name) + ' is now: ' + STAGE_LABEL[to] + '.');
    if (ok && PE[to] && !quiet) await showStageEmail(id, to, 'Moved to <b>' + esc(STAGE_LABEL[to]) + '</b>.');
  }
  function moveDialog(id, to, quiet) {
    var p = personById(id); if (!p) return;
    if (to === 'trade_test') {
      openDlg('Trade test for ' + esc(firstName(p.name)),
        '<p>Put in when and where, exactly as it should read in the email.</p>' +
        '<label class="rct-field"><span>When and where</span><input type="text" id="rctNote" maxlength="160" placeholder="Friday 20 November, 10am, Saadiyat" value="' + esc(p.stage_note || '') + '"></label>' +
        '<p class="rct-amberbox" id="rctMvSay" hidden></p>' +
        '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="mvsave" data-to="trade_test"' + (quiet ? ' data-quiet="1"' : '') + ' data-id="' + esc(p.id) + '">' + (quiet ? 'Save' : 'Save and show the email') + '</button><button type="button" class="rct-btn" data-close>Cancel</button></div>');
    } else {
      openDlg('Start date for ' + esc(firstName(p.name)),
        '<p>Put in the start date you are offering. The email carries a button so ' + esc(firstName(p.name)) + ' can confirm it, and the status updates by itself when they do.</p>' +
        '<label class="rct-field"><span>Start date</span><input type="date" id="rctStart2" value="' + esc(String(p.start_date || '').slice(0, 10)) + '"></label>' +
        '<p class="rct-amberbox" id="rctMvSay" hidden></p>' +
        '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="mvsave" data-to="start_pending"' + (quiet ? ' data-quiet="1"' : '') + ' data-id="' + esc(p.id) + '">' + (quiet ? 'Save' : 'Save and show the email') + '</button><button type="button" class="rct-btn" data-close>Cancel</button></div>');
    }
  }
  async function moveSave(id, to, quiet) {
    var p = personById(id), say = document.getElementById('rctMvSay'); if (!p) return;
    var note = null, start = null;
    if (to === 'trade_test') { note = String((document.getElementById('rctNote') || {}).value || '').trim(); if (!note) { if (say) { say.hidden = false; say.textContent = 'Put in when and where first.'; } return; } }
    else { start = (document.getElementById('rctStart2') || {}).value; if (!start) { if (say) { say.hidden = false; say.textContent = 'Pick the start date first.'; } return; } }
    try {
      var r = await rpcEdit('recruit_move', { p_id: p.id, p_stage: to, p_note: note, p_start: start }); if (r.error) throw new Error(r.error.message);
      if (to === 'start_pending') await acceptUrl(p);
    } catch (e) { console.error(e); if (say) { say.hidden = false; say.textContent = 'That did not save: ' + (e.message || 'try again'); } return; }
    p.stage = to; if (note !== null) p.stage_note = note; if (start) p.start_date = start; p.decided_by = me; p.decided_at = new Date().toISOString();
    closeDlg(); render();
    if (quiet) toast(firstName(p.name) + ' is now: ' + STAGE_LABEL[to] + '.'); else stageEmailDialog(p, to, 'Moved to <b>' + esc(STAGE_LABEL[to]) + '</b>.');
  }
  async function undo() {
    var prev = UNDO.pop(); if (!prev) return;
    var groups = {};
    prev.forEach(function (x) { (groups[x.stage] = groups[x.stage] || []).push(x.id); });
    try {
      for (var st in groups) { var r = await rpcEdit('recruit_set_stage', { p_ids: groups[st], p_stage: st }); if (r.error) throw new Error(r.error.message); }
    } catch (e) { console.error(e); toast('Undo did not save: ' + (e.message || 'try again')); return; }
    prev.forEach(function (x) { var p = personById(x.id); if (p) { p.stage = x.stage; p.decided_by = x.by; p.decided_at = x.at; } });
    render(); toast('Undone.');
  }
  // Kate, 17 Nov 2026: Save in the dialog only writes the values that really changed, so a setting is never marked as changed by someone who only opened the dialog.
  async function saveIfChanged(k, v, dflt) {
    var cur = settings[k] == null ? dflt : settings[k];
    if (JSON.stringify(cur) === JSON.stringify(v)) return;
    await saveSetting(k, v);
  }
  async function saveSetting(k, v) {
    var r = await sb.rpc('recruit_settings_set', { p_key: k, p_value: v });
    if (r.error) throw new Error(r.error.message);
    if (JSON.stringify(settings[k]) !== JSON.stringify(v)) settingsMeta[k] = { by: me, at: new Date().toISOString() };
    settings[k] = v;
  }

  /* ---------- events ---------- */
  function bind() {
    var el = main(); if (!el || el.__rctBound) return;
    el.__rctBound = true;
    el.addEventListener('click', function (e) { var cb = e.target && e.target.closest && e.target.closest('input[data-sel]'); if (cb) bulkTick(cb, e.shiftKey); });
    document.addEventListener('change', async function (e) {
      var i = e.target; if (!i || !i.getAttribute || !i.getAttribute('data-attach') || !main() || !main().contains(i)) return;
      var p = personById(i.getAttribute('data-attach')), f = i.files && i.files[0]; if (!p || !f) return;
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!CV_TYPES[ext] || f.size > 5242880) { i.value = ''; toast('The CV must be a PDF, Word file or picture, up to 5 MB.'); return; }
      try { await uploadCv(p, f, ext); toast('CV attached to ' + (p.name || 'this person') + '.'); render(); }
      catch (err) { console.error(err); toast('The CV did not attach: ' + (err.message || 'try again')); }
      i.value = '';
    });
    document.addEventListener('click', async function (e) {
      var pop = popEl();
      if (!pop.hidden && !pop.contains(e.target) && !(e.target.closest && e.target.closest('[data-fcol]'))) closePop();
      var t = e.target.closest && e.target.closest('[data-act],[data-fig],[data-role],[data-close],[data-undo],[data-lane],[data-mode],[data-fcol],[data-cf],[data-sort],[data-sel],[data-popclear],[data-popdone]');
      if (!t) return;
      var inMain = main() && main().contains(t), inDlg = dlg().contains(t), inToast = document.getElementById('rctToast') && document.getElementById('rctToast').contains(t), inPop = pop.contains(t);
      if (!inMain && !inDlg && !inToast && !inPop) return;
      if (t.hasAttribute('data-close')) { closeDlg(); return; }
      if (t.hasAttribute('data-undo')) { undo(); return; }
      // a tile (or the Show everyone button) filters BOTH Grid and List by that lane; tap it again to clear
      if (t.hasAttribute('data-fig') || t.hasAttribute('data-lane')) { var k0 = t.getAttribute('data-fig') || t.getAttribute('data-lane'); S.lane = (k0 === 'all' || S.lane === k0) ? null : k0; S.filters = {}; closePop(); render(); var fg = main() && main().querySelector('.rct-figs'); if (fg && t.hasAttribute('data-fig')) { var y = fg.getBoundingClientRect().top + window.pageYOffset - 130; if (y > 0) window.scrollTo({ top: y, behavior: 'smooth' }); } return; }
      if (t.hasAttribute('data-mode')) { setMode(t.getAttribute('data-mode')); return; }
      if (t.hasAttribute('data-fcol')) { var fc = t.getAttribute('data-fcol'); if (!pop.hidden && popCol === fc) closePop(); else openPop(fc, t); return; }
      if (t.hasAttribute('data-sort')) { S.sort = { col: popCol, dir: t.getAttribute('data-sort') }; var sc0 = popCol; renderKeep(); reopenPop(sc0); return; }
      // Kate, 17 Nov 2026 ("i cant check all and assign to ate jho"): a row's tick box also carries data-sel (the person's id), and it fell into the filter popup's Select all / Clear selection code below,
      // which wrote a filter for a column that was not open and broke the next list (Cannot read properties of undefined, reading 'val'). Row tick boxes are handled by their own listener; leave them alone here.
      if (t.hasAttribute('data-sel') && t.tagName === 'INPUT') return;
      if (t.hasAttribute('data-sel')) {
        var allOn = t.getAttribute('data-sel') === 'all', pc = popCol;
        if (allOn) delete S.filters[pc]; else { var none = {}; pop.__vals.forEach(function (v) { none[v] = false; }); S.filters[pc] = none; }
        renderKeep(); reopenPop(pc); return;
      }
      if (t.hasAttribute('data-popclear')) { delete S.filters[popCol]; if (S.sort.col === popCol && popCol !== 'wait') S.sort = { col: 'wait', dir: 'desc' }; closePop(); render(); return; }
      if (t.hasAttribute('data-popdone')) { closePop(); return; }
      if (t.hasAttribute('data-cf')) {
        var cc = t.getAttribute('data-cf'), vv = t.getAttribute('data-cv'), cur = S.filters[cc];
        if (cur && Object.keys(cur).filter(function (x) { return cur[x]; }).length === 1 && cur[vv]) delete S.filters[cc];
        else { var o = {}; listRows(cc).forEach(function (p) { o[colBy(cc).val(p)] = false; }); o[vv] = true; S.filters[cc] = o; }
        closePop(); render(); return;
      }
      var a = t.getAttribute('data-act'), id = t.getAttribute('data-id'), g = t.getAttribute('data-g'), p = id ? personById(id) : null;
      if (a === 'short') { var wasNew = p && p.stage === 'new'; shortDialog(id); if (wasNew) { TL = []; notifyShortlist(id); emailShortlist(id); } }
      else if (a === 'invite') { if (await setStage([id], 'screening', 'Moved to Screening.')) closeDlg(); }
      else if (a === 'booked') setStage([id], 'interview_booked', 'Moved to Interview booked.');
      // Kate, 16 Nov 2026: after the interview (ate Jho and ate Frans for support roles, Coach Emma for stylists and beauticians) the next step is the Trade test (Jho, 16 Nov); No works as everywhere else
      else if (a === 'mv') moveTo(id, t.getAttribute('data-to'));
      else if (a === 'mvmail') showStageEmail(id, p && p.stage === 'offer' ? 'offer_to_send' : p && p.stage);
      else if (a === 'mvsave') moveSave(id, t.getAttribute('data-to'), t.getAttribute('data-quiet') === '1');
      else if (a === 'copyst') { var rps = stageEmailParts(p, t.getAttribute('data-to')), ress = rps ? await copyRich(rps.htmlCopy, rps.text) : ''; t.textContent = ress === 'rich' ? 'Copied, with formatting' : ress === 'plain' ? 'Copied as plain text' : 'Copy did not work here'; }
      else if (a === 'ttgood') moveTo(id, 'trade_pass');
      else if (a === 'ttbad') moveTo(id, 'trade_fail');
      else if (a === 'hire') hireDialog(id);
      else if (a === 'hiresave') hireSave(id);
      else if (a === 'passed') moveTo(id, 'interview_pass');
      // No: the person is marked Not now (that also counts as reviewed), then the reply is offered. Nothing is sent by the site.
      else if (a === 'no') { if (await setStage([id], 'not_now', 'Not now for ' + firstName(p && p.name) + '.')) noDialog(id); }
      else if (a === 'reply') { markReviewed([id]); noDialog(id); }
      else if (a === 'look') { openRows[id] = !openRows[id]; if (openRows[id]) markReviewed([id]); render(); }
      else if (a === 'back') setStage([id], 'new', 'Put back in the list.');
      else if (a === 'bulk') bulkDialog(g);
      else if (a === 'bulkgo') { var ids = bulkReviewed(g).map(function (x) { return x.id; }); if (ids.length && await setStage(ids, 'not_now', 'Not now for ' + pl(ids.length, 'person', 'people') + '.')) closeDlg(); }
      else if (a === 'copy') { var r = document.getElementById('rctReply'); try { await navigator.clipboard.writeText(r ? r.textContent : ''); t.textContent = 'Copied'; } catch (err) { t.textContent = 'Select the text and copy'; } }
      else if (a === 'copyno') { var rp1 = replyParts(p, false), res1 = await copyRich(rp1.htmlCopy, rp1.text); t.textContent = res1 === 'rich' ? 'Copied, with formatting' : res1 === 'plain' ? 'Copied as plain text' : 'Copy did not work here'; }
      else if (a === 'copybulk') { var rp2 = replyParts(null, true), res2 = await copyRich(rp2.htmlCopy, rp2.text); t.textContent = res2 === 'rich' ? 'Reply copied, with formatting' : res2 === 'plain' ? 'Reply copied as plain text' : 'Copy did not work here'; }
      else if (a === 'copyemails') { var em = bulkReviewed(g).map(function (x) { return x.email; }).filter(Boolean).join(', '); try { await navigator.clipboard.writeText(em); t.textContent = 'Copied'; } catch (err) { t.textContent = 'Copy did not work here'; } }
      else if (a === 'settings') settingsDialog();
      else if (a === 'addperson') addDialog();
      else if (a === 'saveperson') await savePerson(t);
      else if (a === 'usedefault') { document.getElementById('rctDec').value = DEFAULT_DECLINE; document.getElementById('rctSub').value = DEFAULT_SUBJECT; var sy = document.getElementById('rctSay'); if (sy) sy.textContent = 'The approved wording is back in the box. Press Save to keep it.'; }
      else if (a === 'savesettings') {
        var say = document.getElementById('rctSay'); if (say) say.textContent = 'Saving.';
        try {
          await saveIfChanged('booking_link', (document.getElementById('rctLink').value || '').trim(), '');
          await saveIfChanged('invite_template', document.getElementById('rctInv').value, '');
          await saveIfChanged('decline_template', document.getElementById('rctDec').value, DEFAULT_DECLINE);
          await saveIfChanged('decline_subject', (document.getElementById('rctSub').value || '').trim() || DEFAULT_SUBJECT, DEFAULT_SUBJECT);
          await saveIfChanged('templates_confirmed', !!document.getElementById('rctOk').checked, false);
          closeDlg(); render(); toast('Saved.');
        } catch (err) { console.error(err); if (say) say.textContent = 'That did not save: ' + err.message; }
      }
      else if (a === 'toggledone') { S.showDone = !S.showDone; render(); }
      else if (a === 'clearfilters') { S.filters = {}; q = ''; closePop(); render(); }
      else if (a === 'photo') pickPhoto(id);
      else if (a === 'photofile') pickPhotoFile(id);
      else if (a === 'photoclear') clearPhoto(id);
      else if (a === 'photobad') togglePhotoBad(id);
      else if (a === 'bk') setBucket(id, t.getAttribute('data-to'));
      else if (a === 'notapp') setNotApplicant(id, true);
      else if (a === 'notappback') setNotApplicant(id, false);
      else if (a === 'cvfile') openCvFile(id);
      // a private link for someone with no dashboard access: a fresh token that works for 7 days and opens only this CV (migrations/recruit_cv_share.sql, edge function recruit-cv-share, page /cv/)
      else if (a === 'cvlink7') { try { var rs = await sb.rpc('recruit_cv_share_make', { p_id: p.id }); if (rs.error) throw new Error(rs.error.message); await navigator.clipboard.writeText('https://trk-salon-os.com/cv/?t=' + encodeURIComponent(rs.data)); t.textContent = 'Link copied'; toast('Link copied. It works for 7 days and opens only ' + firstName(p && p.name) + "'s CV, no sign-in needed."); } catch (err) { console.error(err); t.textContent = 'Did not work'; toast('That link could not be made: ' + (err.message || 'try again')); } }
      else if (a === 'cvlink') { try { await navigator.clipboard.writeText(cvShareLink(p)); t.textContent = 'Link copied'; toast('Link copied. Whoever opens it signs in to the dashboard, and ' + firstName(p && p.name) + "'s CV opens for them."); } catch (err) { t.textContent = 'Copy did not work here'; } }
      else if (a === 'rename') renameDialog(id);
      else if (a === 'hist') showHistory(id);
      else if (a === 'assign') assignTo(id, false);
      else if (a === 'bassign') bulkAssign(t.getAttribute('data-to'));
      else if (a === 'bletgo') bulkLetGo();
      else if (a === 'bclear') { SEL = {}; lastSel = -1; bulkRefresh(); }
      else if (a === 'selpage') { [].forEach.call(main().querySelectorAll('input[data-sel]'), function (c) { SEL[c.getAttribute('data-sel')] = 1; }); bulkRefresh(); }
      else if (a === 'selall') { listRows().forEach(function (p) { SEL[p.id] = 1; }); bulkRefresh(); }
      else if (a === 'bstatusok') bulkStatusDo(t.getAttribute('data-to'));
      else if (a === 'unassign') assignLet(id);
      else if (a === 'takeover') takeoverAsk(id);
      else if (a === 'takeoverok') assignTo(id, true);
      else if (a === 'emails') emailFormatsDialog();
      else if (a === 'renamesave') renameSave(id);
      else if (a === 'photobulk') pickBulk();
      else if (a === 'pgprev') { S.page = Math.max(0, S.page - 1); render(); }
      else if (a === 'pgnext') { S.page += 1; render(); }
      else if (a === 'morelook') { shownLook += PAGE; render(); }
      else if (a === 'moreno') { shownNo[g] = (shownNo[g] || PAGE) + PAGE; render(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'rctRoles') { e.preventDefault(); e.target.blur(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'rctNameIn') { e.preventDefault(); var b = document.querySelector('[data-act="renamesave"]'); if (b) renameSave(b.getAttribute('data-id')); } });
    document.addEventListener('change', async function (e) {
      if (e.target && e.target.id === 'rctRoles') {
        var v = e.target.value.replace(/\s*[,;]\s*/g, ', ').replace(/^[,\s]+|[,\s]+$/g, ''), was = settings.open_roles_text;
        settings.open_roles_text = v; render();
        try { await saveSetting('open_roles_text', v); toast(v ? 'Hiring for: ' + v + '.' : 'No roles listed, so nobody is moved for their role.'); }
        catch (err) { console.error(err); settings.open_roles_text = was; render(); toast('That did not save: ' + err.message); }
        return;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-bulk')) { var bk = e.target.getAttribute('data-bulk'), bv = e.target.value; e.target.value = ''; if (bv) { if (bk === 'status') bulkStatusAsk(bv); else bulkPref(bv); } return; }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-rs')) { setRole(e.target.getAttribute('data-rs'), e.target.value); return; }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-ss')) { changeStatus(e.target.getAttribute('data-ss'), e.target.value); return; }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-pl')) { setPref(e.target.getAttribute('data-pl'), e.target.value); return; }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-bk')) { setBucket(e.target.getAttribute('data-bk'), e.target.value); return; }
      if (e.target && e.target.id === 'rctPageSize') { var n = parseInt(e.target.value, 10); if (SIZES.indexOf(n) >= 0) { S.pageSize = n; S.page = 0; savePageSize(n); render(); } }
    });
    document.addEventListener('change', function (e) { if (popCol && e.target && e.target.type === 'checkbox' && popEl().contains(e.target)) popChange(); });
    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'rctPopQ') { var f = e.target.value.toLowerCase(); [].forEach.call(document.querySelectorAll('#rctPopList label'), function (l) { l.style.display = l.textContent.toLowerCase().indexOf(f) < 0 ? 'none' : ''; }); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePop();
      if (!e.key || e.key.toLowerCase() !== 'v' || e.ctrlKey || e.metaKey || e.altKey) return;
      var mn = main(); if (!mn || mn.offsetParent === null || dlg().open) return;   // only while this page is the one on screen
      var tg = e.target, tag = ((tg && tg.tagName) || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (tg && tg.isContentEditable)) return;
      setMode(S.mode === 'list' ? 'grid' : 'list');
    });
    // opening "What they wrote" on a card counts as having looked at that person
    el.addEventListener('toggle', function (e) {
      var d = e.target; if (d && d.classList && d.classList.contains('rct-about') && d.open) markReviewed([d.getAttribute('data-id')]);
    }, true);
    el.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'rctFind') {
        q = e.target.value; e.target.__keep = true;
        clearTimeout(bind.t); bind.t = setTimeout(function () { var pos = e.target.selectionStart; render(); var i2 = document.getElementById('rctFind'); if (i2) { i2.focus(); try { i2.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 220);
      }
    });
  }

  function notFound() {
    var el = main(); if (el) el.innerHTML = '<p class="slv-muted">This page is only open to Kate and Coach Emma.</p>';
  }

  // Called by showView each time the page opens.
  window.renderRecruitment = async function () {
    var el = main(); if (!el) return;
    var ok = typeof TRS_LEVEL !== 'undefined' && (typeof trsPageOpen === 'function' ? trsPageOpen('recruitment', TRS_LEVEL, typeof TRS_EXTRA !== 'undefined' ? TRS_EXTRA : []) : TRS_LEVEL >= 5);
    if (!ok) { notFound(); return; }
    bind(); loadErr = ''; shownLook = PAGE; shownNo = {};
    if (!C) render();
    try {
      // Kate, 16 Nov 2026: Finalise start date (accepted) becomes Hired once the first day has passed; the database also does this daily, the page asks as well so it is never a day behind.
      try { await sb.rpc('recruit_auto_hire'); } catch (e) { /* harmless, the daily job covers it */ }
      var r = await sb.rpc('recruit_get');
      if (r.error) throw new Error(r.error.message);
      C = r.data || null;
      if (!C) throw new Error('No data came back.');
      var allRows = C.rows || []; rows = allRows.filter(function (p) { return !p.not_app; }); gone = allRows.filter(function (p) { return p.not_app; }); settings = C.settings || {}; settingsMeta = C.settings_meta || {}; me = C.me || '';
      applyUrl();   // a link with filters in it (see rctUrlParts) opens the page already filtered
      await loadPhotoUrls();
    } catch (e) {
      console.error(e); C = null; loadErr = 'The applicants could not be read just now (' + (e.message || 'unknown') + '). Refresh the page to try again.';
    }
    if (main() && main().offsetParent !== null) render();
    if (C) liveStart();
    // the link in the interviewers' WhatsApp: ?view=recruitment&cand=<id> opens that person's details (and the CV button) once
    try {
      var cand = urlCand || new URLSearchParams(location.search).get('cand'), cp = cand && personById(cand);
      if (cp && !openRows[cp.id] && !renderRecruitment.__candDone) {
        renderRecruitment.__candDone = true; S.lane = null; S.filters = {}; openRows[cp.id] = true; render();
        var cel = main() && main().querySelector('[data-id="' + cp.id + '"]'); if (cel && cel.scrollIntoView) cel.scrollIntoView({ block: 'center' });
        if (urlOpenCv && cp.cv_file) openCvFile(cp.id);
      }
    } catch (e) { /* the link is a convenience, never an error */ }
  };
  // only used by the local test harness (it sets window.__RCT_TEST__ first); nothing on the live site sets it
  if (window.__RCT_TEST__) window.__rctTest = { replyParts: replyParts, greetingFor: greetingFor, setSettings: function (s) { settings = s; } };
})();
