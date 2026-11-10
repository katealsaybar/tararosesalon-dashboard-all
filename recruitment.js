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
  function pl(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var ROLES = [['stylist', 'Hair stylist'], ['colourist', 'Colourist'], ['beauty', 'Beauty therapist'], ['nails', 'Nail technician'],
               ['front', 'Front desk'], ['barber', 'Barber'], ['braider', 'Hair braider']];
  var STAGE_LABEL = { new: 'New', screening: 'Screening', interview_booked: 'Interview booked', trade_test: 'Trade test', offer: 'Offer', hired: 'Hired', not_now: 'Not now', rejected: 'Rejected' };
  var PAGE = 10;   // Kate, 10 Nov 2026: 10 cards at a time in Grid (Show 10 more); the List has its own Rows per page (10, 20, 50, 100)
  var C = null, loadErr = '', rows = [], settings = {}, me = '', q = '', shownLook = PAGE, shownNo = {}, bound = false, toastTimer = null, openRows = {};
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
  function igUrl(p) {
    if (p.ig_handle) return 'https://www.instagram.com/' + encodeURIComponent(String(p.ig_handle).replace(/^@/, ''));
    return p.link_kind === 'instagram' ? safeUrl(p.work_link) : '';
  }
  function flags(p) {
    var f = [], w = where(p);
    if (w === 'abroad') f.push({ k: 'abroad', t: 'Not based in the UAE' + (/relocat/i.test(p.about || '') ? ' (says they can relocate)' : '') });
    // a form always asks for a work link, so none means no Instagram; a direct email only counts when it gave some other link
    if (!hasIg(p) && (p.source === 'form' || p.link_kind)) {
      var kind = p.link_kind && p.link_kind !== 'instagram' ? ({ tiktok: 'TikTok', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube' }[p.link_kind] || p.link_kind) : '';
      f.push({ k: 'noig', t: kind ? 'No Instagram (gave a ' + kind + ' link instead)' : 'No Instagram given' });
    }
    var terms = openTerms();
    if (p.role_key && p.role_key !== 'other' && terms.length && !roleListed(p, terms)) {
      var nm = ROLES.filter(function (r) { return r[0] === p.role_key; })[0];
      f.push({ k: 'role', t: 'Applying as ' + (nm ? nm[1].toLowerCase() : p.role_key) + ', not on your open list' });
    }
    return f;
  }
  function bucket(p) {
    if (p.stage === 'new') return flags(p).length ? 'no' : 'look';
    if (p.stage === 'screening') return 'invited';
    if (p.stage === 'interview_booked') return 'booked';
    if (p.stage === 'not_now' || p.stage === 'rejected') return 'done';
    return 'later';
  }
  function isLate(p) { return p.stage === 'new' && !p.replied_at && waited(p) >= waitDays(); }
  function by(b) { return rows.filter(function (p) { return bucket(p) === b; }).sort(function (a, c) { return new Date(a.applied_at) - new Date(c.applied_at); }); }
  function lateList() { return rows.filter(isLate).sort(function (a, c) { return new Date(a.applied_at) - new Date(c.applied_at); }); }

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
  function stagePill(p) {
    if (p.stage === 'new') return '';
    var cls = p.stage === 'interview_booked' || p.stage === 'hired' || p.stage === 'offer' ? 'rct-green' : p.stage === 'not_now' || p.stage === 'rejected' ? 'rct-grey' : 'rct-teal';
    return '<span class="rct-pill ' + cls + '">' + esc(STAGE_LABEL[p.stage] || p.stage) + '</span>';
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
    other: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="#9aa0b4" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  var LK_NAME = { ig: 'Instagram', fb: 'Facebook', x: 'X', drive: 'Google Drive', cloud: 'Cloud storage', other: 'Other link' };
  function linkHost(p) { var m = /^https?:\/\/(?:www\.|m\.)?([^\/?#:]+)/i.exec(safeUrl(p.work_link)); return m ? m[1].toLowerCase() : ''; }
  function linkKind(p) {   // ig, fb, x, drive, cloud, other, or '' when they gave no link
    if (hasIg(p)) return 'ig';
    var h = linkHost(p); if (!h) return '';
    if (/(^|\.)instagram\.com$/.test(h)) return 'ig';
    if (/(^|\.)(facebook|fb)\.com$|^fb\.me$/.test(h)) return 'fb';
    if (/^(x|twitter)\.com$|^t\.co$/.test(h)) return 'x';
    if (/^(drive|docs)\.google\.com$|^drive\.usercontent\.google\.com$/.test(h)) return 'drive';
    if (/dropbox\.com$|onedrive\.live\.com$|^1drv\.ms$|sharepoint\.com$|icloud\.com$|wetransfer\.com$|^we\.tl$|(^|\.)box\.com$|mega\.nz$|pcloud\.com$|mediafire\.com$/.test(h)) return 'cloud';
    return 'other';
  }
  function linkName(p) { var k = linkKind(p); if (k !== 'other') return LK_NAME[k] || ''; return ({ tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', facebook: 'Facebook' }[p.link_kind]) || (linkHost(p) === 'wa.me' ? 'WhatsApp' : 'Other link'); }
  function linkUrl(p) { return igUrl(p) || safeUrl(p.work_link); }
  function lk(kind, inner) { return '<span class="rct-lk"><span class="rct-lki" title="' + esc(LK_NAME[kind] || '') + '">' + LK_ICON[kind] + '</span>' + inner + '</span>'; }
  function igHtml(p) {
    var u = igUrl(p);
    if (hasIg(p)) {
      var label = p.ig_handle ? '@' + String(p.ig_handle).replace(/^@/, '') : 'Instagram';
      return lk('ig', u ? '<a class="rct-ig" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label) + '</a>' : esc(label));
    }
    var other = safeUrl(p.work_link);
    if (other) return lk(linkKind(p), '<a class="rct-ig" href="' + esc(other) + '" target="_blank" rel="noopener">' + esc(linkName(p)) + '</a>');
    return p.source === 'form' ? '<span class="rct-none">None given</span>' : '<span class="rct-ns">Not stated</span>';
  }
  function linksHtml(p) {
    var s = '', cv = safeUrl(p.cv_link);
    if (cv) s += '<a href="' + esc(cv) + '" target="_blank" rel="noopener">CV</a>';
    if (p.email) s += '<a href="https://mail.google.com/mail/?authuser=recruitment@tararosesalon.com#search/' + encodeURIComponent(p.email) + '" target="_blank" rel="noopener">Their emails in Gmail</a>';
    var wa = String(p.whatsapp || '').replace(/\D/g, '');
    if (wa.length >= 9) s += '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>';
    s += '<button type="button" class="rct-linkbtn" data-act="photo" data-id="' + esc(p.id) + '">' + (p.photo ? 'Change photo' : 'Add photo') + '</button>';
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
      '<div class="rct-fact"><span>Applying for</span><b>' + roleLine(p) + '</b></div>' +
      '<div class="rct-fact"><span>Applied</span><b>' + esc(fat(p.applied_at)) + ' <span class="rct-src">(' + (p.source === 'form' ? 'website form' : 'email') + (p.merged > 1 ? ', ' + p.merged + ' emails merged' : '') + ')</span></b></div>' +
      '</div>';
  }
  // the open "Look" panel under a row: everything the card shows, so a person can be read without leaving the list (opening it counts as reviewing them)
  function detailHtml(p) {
    return '<div class="rct-rowdetail">' + factsHtml(p) + (p.about ? '<p class="rct-aboutfull"><b>What they wrote:</b> ' + esc(p.about) + '</p>' : '') + linksHtml(p) + '</div>';
  }
  function roleLine(p) { return esc(p.role_txt || p.paths || p.specialist || '') || '<span class="rct-ns">Not stated</span>'; }

  function card(p) {
    return '<article class="rct-card">' +
      '<div class="rct-ctop"><div class="rct-cwho">' + avatar(p, true) + '<h3>' + esc(p.name || 'Name not stated') + '</h3></div><div class="rct-pills">' + waitPill(p) + extraPills(p) + '</div></div>' +
      '<div class="rct-facts">' +
        '<div class="rct-fact"><span>Based in</span><b>' + placeOf(p) + '</b></div>' +
        '<div class="rct-fact"><span>Link to work</span><b>' + igHtml(p) + '</b></div>' +
        '<div class="rct-fact"><span>Experience</span><b>' + stated(p.experience) + '</b></div>' +
        '<div class="rct-fact"><span>Applying for</span><b>' + roleLine(p) + '</b></div>' +
        '<div class="rct-fact"><span>Applied</span><b>' + esc(fat(p.applied_at)) + ' <span class="rct-src">(' + (p.source === 'form' ? 'website form' : 'email') + (p.merged > 1 ? ', ' + p.merged + ' emails merged' : '') + ')</span></b></div>' +
      '</div>' + aboutHtml(p) + linksHtml(p) +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="short" data-id="' + esc(p.id) + '">Shortlist</button>' +
      '<button type="button" class="rct-btn" data-act="no" data-id="' + esc(p.id) + '">No</button></div></article>';
  }
  function row(p) {
    var why = flags(p).map(function (f) { return f.t; }).join(' and ');
    var sub = p.stage === 'new' ? (why || (p.role_txt || '')) :
              p.stage === 'screening' ? 'Invite sent ' + fat(p.decided_at) + ', not booked yet' :
              p.stage === 'interview_booked' ? 'Interview booked, moved ' + fat(p.decided_at) :
              p.stage === 'not_now' || p.stage === 'rejected' ? (STAGE_LABEL[p.stage] + ' ' + fat(p.decided_at)) : (STAGE_LABEL[p.stage] || '');
    var acts = '', lookBtn = '<button type="button" class="rct-btn rct-sm" data-act="look" data-id="' + esc(p.id) + '" aria-expanded="' + !!openRows[p.id] + '">' + (openRows[p.id] ? 'Hide' : 'Look') + '</button>';
    if (p.stage === 'new') acts = lookBtn + '<button type="button" class="rct-btn rct-sm" data-act="short" data-id="' + esc(p.id) + '">Shortlist</button>' +
                                  '<button type="button" class="rct-btn rct-sm" data-act="no" data-id="' + esc(p.id) + '">No</button>';
    else if (p.stage === 'screening') acts = '<button type="button" class="rct-btn rct-sm" data-act="booked" data-id="' + esc(p.id) + '">Interview booked</button><button type="button" class="rct-btn rct-sm" data-act="short" data-id="' + esc(p.id) + '">Invite again</button>';
    else if (p.stage === 'not_now' || p.stage === 'rejected') acts = '<button type="button" class="rct-btn rct-sm" data-act="reply" data-id="' + esc(p.id) + '">Reply</button><button type="button" class="rct-btn rct-sm" data-act="back" data-id="' + esc(p.id) + '">Put back</button>';
    var det = [p.emirate || p.country, p.experience, p.role_txt].filter(Boolean).map(esc).join(' &middot; ');
    return '<div class="rct-row">' + avatar(p) + '<div class="rct-who"><b>' + esc(p.name || 'Name not stated') + '</b>' +
      (det ? '<span>' + det + '</span>' : '') + '<span>' + esc(sub) + '</span></div>' +
      '<div class="rct-acts">' + waitPill(p) + extraPills(p) + stagePill(p) + acts + '</div>' + (openRows[p.id] ? detailHtml(p) : '') + '</div>';
  }
  var GROUPS = [['abroad', 'Not based in the UAE'], ['noig', 'No Instagram given'], ['role', 'Role not on your open list']];
  function noGroups() {
    var g = { abroad: [], noig: [], role: [] };
    by('no').forEach(function (p) { g[flags(p)[0].k].push(p); });
    return g;
  }
  function fig(key, n, label, cls) {
    return '<button type="button" class="rct-fig ' + (cls || '') + (S.lane === key ? ' rct-sel' : '') + '" data-fig="' + key + '" aria-pressed="' + (S.lane === key) + '"><span class="rct-n">' + n + '</span><span class="rct-l">' + label + '</span></button>';
  }

  function found() {
    var t = q.trim().toLowerCase();
    return rows.filter(function (p) {
      return [p.name, p.email, p.whatsapp, p.country, p.emirate].join(' ').toLowerCase().indexOf(t) >= 0;
    }).sort(function (a, c) { return new Date(c.applied_at) - new Date(a.applied_at); });
  }

  function render() {
    var el = main(); if (!el) return;
    var h = '<div class="rct">';
    h += '<h2>Recruitment</h2><p class="rct-lead">Who is worth Emma’s time today, and who is still waiting for an answer.</p>';
    h += '<div class="rct-pills rct-top"><span class="rct-pill rct-teal">Kate and Emma only</span>' +
         '<span class="rct-pill rct-grey">Checked every 5 minutes from the two inboxes</span></div>';
    if (loadErr) { el.innerHTML = h + '<p class="rct-warn">' + esc(loadErr) + '</p></div>'; return; }
    if (!C) { el.innerHTML = h + '<p class="slv-muted">Loading.</p></div>'; return; }

    var look = by('look'), no = by('no'), late = lateList(), inv = by('invited'), bk = by('booked');
    h += '<div class="rct-figs">' +
      fig('look', look.length, 'Worth a look, need your yes or no', 'rct-main') +
      fig('no', no.length, 'Probably no, flagged for you') +
      fig('late', late.length, 'Waiting ' + waitDays() + ' days or more with no reply', late.length ? 'rct-warnfig' : '') +
      fig('invited', inv.length, 'Invited, not booked yet') +
      fig('booked', bk.length, 'Interview booked') + '</div>';

    h += '<div class="rct-bar"><label class="rct-find"><span class="rct-sr">Find someone</span><input type="search" id="rctFind" placeholder="Find someone by name, email or country" value="' + esc(q) + '" autocomplete="off"></label>' +
         segHtml() + '<button type="button" class="rct-btn rct-sm" data-act="photobulk">Add photos</button><button type="button" class="rct-btn rct-sm" data-act="settings">Booking link and replies</button></div>';

    if (!setting('booking_link', '') || !setting('templates_confirmed', false) || !setting('decline_confirmed', false)) {
      h += '<p class="rct-note rct-amberbox">' + (!setting('booking_link', '') ? 'The booking link is not set yet. ' : '') +
           (!setting('templates_confirmed', false) ? 'The invite reply is still placeholder text until you save your own. ' : '') +
           (!setting('decline_confirmed', false) ? 'The signature on the No email (Emma-Louise Usher, General Manager) is not confirmed yet. ' : '') +
           '<button type="button" class="rct-linkbtn" data-act="settings">Set them now</button></p>';
    }

    h += '<div class="rct-roles"><label class="rct-lab" for="rctRoles">What we are hiring for right now</label>' +
      '<input type="text" id="rctRoles" class="rct-rolein" value="' + esc(openText()) + '" placeholder="Type the roles, separated by commas, for example Hair stylist, Receptionist" autocomplete="off">' +
      '<p class="rct-hint">Type what is needed and press Enter. Anyone applying for a role that is not in this list moves to Probably no. Leave it empty and nobody is moved because of their role.</p></div>';

    if (S.lane) h += laneBarHtml();
    if (S.mode === 'list') {
      var bxOld = document.getElementById('rctTbox'), keepPos = bxOld ? [bxOld.scrollTop, bxOld.scrollLeft] : null;
      h += renderList() + '<p class="rct-hint">Grid or List is remembered for you on this browser. Press V to switch. Stage names are the TRS Recruitment labels already in the inboxes. The dashboard never sends email. Waiting counts days since the application with no human reply.</p>';
      el.innerHTML = h + '</div>';
      var bxNew = document.getElementById('rctTbox'); if (bxNew && keepPos) { bxNew.scrollTop = keepPos[0]; bxNew.scrollLeft = keepPos[1]; }
      return;
    }
    if (q.trim().length >= 2) {
      var f = found();
      h += '<section class="rct-sec"><div class="rct-sech"><h2>Found<span class="rct-cnt">' + f.length + '</span></h2></div>' +
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

    var prog = rows.filter(function (p) { var b = bucket(p); return (b === 'invited' || b === 'booked' || b === 'later') && (!S.lane || b === S.lane); });
    if (!S.lane || S.lane === 'invited' || S.lane === 'booked') {
    h += '<section class="rct-sec"><div class="rct-sech"><h2>In progress<span class="rct-cnt">' + prog.length + '</span></h2></div><div class="rct-card rct-list">' +
      (prog.length ? prog.map(row).join('') : '<p class="rct-hint">No one yet.</p>') + '</div></section>';
    }

    if (!S.lane) {
    var done = rows.filter(function (p) { return bucket(p) === 'done'; }).sort(function (a, c) { return new Date(c.decided_at || 0) - new Date(a.decided_at || 0); });
    h += '<details class="rct-grp rct-donebox" data-g="done"><summary><span>Not now<span class="rct-cnt">' + done.length + '</span></span></summary><div class="rct-dbody">' +
      (done.length ? done.slice(0, 30).map(row).join('') + (done.length > 30 ? '<p class="rct-hint">Showing the latest 30.</p>' : '') : '<p class="rct-hint">No one yet.</p>') + '</div></details>';
    }
    h += '<p class="rct-note">Stage names are the TRS Recruitment labels already in the inboxes. The dashboard never sends email: Shortlist gives you the reply to send from the recruitment inbox. Waiting counts days since the application with no human reply; the automatic brochure email does not count.</p>';
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
    if (!S.lane) return bucket(p) !== 'done' || S.showDone;
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
  function roleGroup(p) {
    var r = ROLES.filter(function (x) { return x[0] === p.role_key; })[0];
    return r ? r[1] : 'Other';
  }
  function roleShort(p) {
    var s = String(p.role_txt || p.paths || p.specialist || '').replace(/^[\s\-]+/, '');
    if (!s) return 'Not stated';
    if (/Path (One|Two|Three)/i.test(s)) {
      var n = []; if (/Path One/i.test(s)) n.push('Employed stylist'); if (/Path Two/i.test(s)) n.push('Flexible stylist'); if (/Path Three/i.test(s)) n.push('Rent-a-chair');
      return n.join(', ');
    }
    return s.length > 48 ? s.slice(0, 46) + '…' : s;
  }
  function statusText(p) {
    var b = bucket(p);
    if (b === 'look') return 'Worth a look';
    if (b === 'no') return 'Probably no: ' + ({ abroad: 'Not in the UAE', noig: 'No Instagram', role: 'Role not open' })[flags(p)[0].k];
    return STAGE_LABEL[p.stage] || p.stage;
  }
  function waitBucket(p) {
    if (p.stage !== 'new') return 'Not waiting';
    if (p.replied_at) return 'We replied';
    var d = waited(p); return d >= 21 ? '21 days or more' : d >= 14 ? '14 to 20 days' : d >= 7 ? '7 to 13 days' : 'Under 7 days';
  }
  function igLabel(p) { var k = linkKind(p); return k ? linkName(p) : (p.source === 'form' ? 'None given' : 'Not stated'); }
  // Kate, 10 Nov 2026: which inbox the application arrived in (a person who wrote to both shows as Both)
  function srcLabel(p) { var m = p.mailboxes || [], i = m.indexOf('info') >= 0, r = m.indexOf('recruitment') >= 0; return i && r ? 'Both inboxes' : i ? 'info@' : r ? 'recruitment@' : 'Not stated'; }
  function monthOf(p) { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', month: 'long', year: 'numeric' }).format(new Date(p.applied_at)); } catch (e) { return ''; } }

  var COLS = [
    { k: 'av', t: '', nofilter: true },
    { k: 'name', t: 'Name', val: function (p) { return p.name || 'Name not stated'; }, sort: function (p) { return String(p.name || '').toLowerCase(); }, kind: 'text' },
    { k: 'place', t: 'Based in', val: countryShort, sort: function (p) { return placeShort(p).toLowerCase(); }, kind: 'text' },
    { k: 'ig', t: 'Link to work', val: igLabel, sort: function (p) { return (linkKind(p) ? '0' : '1') + igLabel(p).toLowerCase(); }, kind: 'text' },
    { k: 'exp', t: 'Experience', val: function (p) { return p.experience || 'Not stated'; }, sort: expNum, kind: 'num', asc: 'Fewest years first', desc: 'Most years first' },
    { k: 'role', t: 'Applying for', val: roleGroup, sort: function (p) { return roleShort(p).toLowerCase(); }, kind: 'text' },
    { k: 'applied', t: 'Applied', val: monthOf, sort: function (p) { return new Date(p.applied_at).getTime(); }, kind: 'num', asc: 'Oldest first', desc: 'Newest first' },
    { k: 'src', t: 'Came from', val: srcLabel, sort: function (p) { return srcLabel(p).toLowerCase(); }, kind: 'text' },
    { k: 'wait', t: 'Waiting', val: waitBucket, sort: function (p) { return (p.stage === 'new' && !p.replied_at) ? waited(p) : -1; }, kind: 'num', asc: 'Shortest wait first', desc: 'Longest wait first' },
    { k: 'status', t: 'Status', val: statusText, sort: function (p) { return statusText(p).toLowerCase(); }, kind: 'text' },
    { k: 'acts', t: 'Application Status', nofilter: true }
  ];
  function colBy(k) { return COLS.filter(function (c) { return c.k === k; })[0]; }

  function listRows(ignoreCol) {
    var t = q.trim().toLowerCase();
    return rows.filter(function (p) {
      if (!laneOk(p)) return false;
      if (t.length >= 2 && [p.name, p.email, p.whatsapp, p.country, p.emirate].join(' ').toLowerCase().indexOf(t) < 0) return false;
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
      case 'av': return '<td class="rct-c-av">' + avatar(p) + '</td>';
      case 'name': return '<td class="rct-c-name"><button type="button" class="rct-cellbtn" data-act="look" data-id="' + esc(p.id) + '" aria-expanded="' + !!openRows[p.id] + '"><b>' + esc(p.name || 'Name not stated') + '</b></button>' + (p.bounced ? '<div><span class="rct-pill rct-red">Email bounced</span></div>' : '') + '</td>';
      case 'src': return '<td>' + cellBtn(esc(srcLabel(p)), 'src', srcLabel(p)) + '</td>';
      case 'place': return '<td>' + cellBtn(esc(placeShort(p)), 'place', countryShort(p)) + '</td>';
      case 'ig': {
        var kk = linkKind(p);
        if (kk) {
          var lu = linkUrl(p), ll = kk === 'ig' ? (p.ig_handle ? '@' + String(p.ig_handle).replace(/^@/, '') : 'Instagram') : linkName(p);
          return '<td>' + lk(kk, lu ? '<a class="rct-ig" href="' + esc(lu) + '" target="_blank" rel="noopener">' + esc(ll) + '</a>' : esc(ll)) + '</td>';
        }
        var v = igLabel(p); return '<td>' + cellBtn('<span class="' + (v === 'Not stated' ? 'rct-ns' : 'rct-none') + '">' + esc(v) + '</span>', 'ig', v) + '</td>';
      }
      case 'exp': return '<td>' + cellBtn(esc(p.experience || 'Not stated'), 'exp', p.experience || 'Not stated') + '</td>';
      case 'role': return '<td>' + cellBtn(esc(roleShort(p)), 'role', roleGroup(p)) + '</td>';
      case 'applied': return '<td>' + cellBtn(esc(fat(p.applied_at)), 'applied', monthOf(p)) + '</td>';
      case 'wait': {
        if (p.stage !== 'new') return '<td><span class="rct-ns">-</span></td>';
        if (p.replied_at) return '<td>' + cellBtn('<span class="rct-pill rct-grey">We replied</span>', 'wait', 'We replied') + '</td>';
        var d = waited(p), wd = waitDays(), cl = d >= wd + 7 ? 'rct-red' : d >= wd ? 'rct-amber' : 'rct-grey';
        return '<td><button type="button" class="rct-pill rct-pillbtn ' + cl + '" data-cf="wait" data-cv="' + esc(waitBucket(p)) + '">' + d + ' day' + (d === 1 ? '' : 's') + '</button></td>';
      }
      case 'status': {
        var b = bucket(p), sv = statusText(p), cls = b === 'look' ? 'rct-green' : b === 'no' ? 'rct-amber' : b === 'done' ? 'rct-grey' : (p.stage === 'interview_booked' || p.stage === 'hired' || p.stage === 'offer') ? 'rct-green' : 'rct-teal';
        var main1 = b === 'no' ? 'Probably no' : sv, why = b === 'no' ? sv.replace('Probably no: ', '') : '';
        return '<td><button type="button" class="rct-pill rct-pillbtn ' + cls + '" data-cf="status" data-cv="' + esc(sv) + '">' + esc(main1) + '</button>' + (why ? '<div class="rct-why">' + esc(why) + '</div>' : '') + extraPills(p) + '</td>';
      }
      case 'acts': {
        var id = esc(p.id);
        if (p.stage === 'new') return '<td class="rct-c-acts"><button type="button" class="rct-btn rct-sm rct-pri" data-act="short" data-id="' + id + '">Shortlist</button><button type="button" class="rct-btn rct-sm" data-act="no" data-id="' + id + '">No</button></td>';
        if (p.stage === 'screening') return '<td class="rct-c-acts"><button type="button" class="rct-btn rct-sm" data-act="booked" data-id="' + id + '">Booked</button><button type="button" class="rct-btn rct-sm" data-act="short" data-id="' + id + '">Invite again</button></td>';
        if (p.stage === 'not_now' || p.stage === 'rejected') return '<td class="rct-c-acts"><button type="button" class="rct-btn rct-sm" data-act="reply" data-id="' + id + '">Reply</button><button type="button" class="rct-btn rct-sm" data-act="back" data-id="' + id + '">Put back</button></td>';
        return '<td class="rct-c-acts"></td>';
      }
    }
    return '<td></td>';
  }
  function renderList() {
    var all = rows.filter(laneOk), list = sortedRows(listRows()), doneN = rows.filter(function (p) { return bucket(p) === 'done'; }).length;
    var h = '<div class="rct-tcount">Showing ' + list.length + ' of ' + all.length +
      (S.lane ? '' : (S.showDone ? '. Not now people are included. <button type="button" class="rct-linkbtn" data-act="toggledone">Hide them</button>' : '. Not now people (' + doneN + ') are hidden. <button type="button" class="rct-linkbtn" data-act="toggledone">Show them</button>')) +
      '. Click a value to filter by it, or use the funnel on a column.' + (Object.keys(S.filters).length ? ' <button type="button" class="rct-linkbtn" data-act="clearfilters">Clear all filters</button>' : '') + '</div>';
    h += '<div class="rct-tbox" id="rctTbox"><table class="rct-table"><thead><tr>';
    COLS.forEach(function (c) {
      var sorted = S.sort.col === c.k, act = !!S.filters[c.k] || sorted;
      h += '<th><div class="rct-th' + (sorted ? ' rct-sorted' : '') + '">' + esc(c.t) + (sorted ? '<span class="rct-sortmark">' + (S.sort.dir === 'asc' ? '&#9650;' : '&#9660;') + '</span>' : '') +
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
      if (openRows[p.id]) h += '<tr class="rct-dtl"><td></td><td colspan="' + (COLS.length - 1) + '">' + detailHtml(p) + '</td></tr>';
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
  function replyParts(p, there, greetingOverride) {
    var greeting = greetingOverride || greetingFor(p, there);
    var subject = String(setting('decline_subject', DEFAULT_SUBJECT) || DEFAULT_SUBJECT);
    var blocks = declineBlocks(setting('decline_template', DEFAULT_DECLINE) || DEFAULT_DECLINE);
    var sign = blocks.length > 1 ? blocks.pop().split('\n') : [];
    var text = blocks.concat(sign.length ? [sign.join('\n')] : []).map(function (b) { return plainInline(b, greeting); }).join('\n\n');
    var paras = blocks.map(function (b, i) {
      var last = i === blocks.length - 1;
      return '            <p style="margin:0 0 ' + (last ? '24' : '16') + 'px 0;">' + mdInline(b, greeting).replace(/\n/g, '<br>') + '</p>';
    });
    var signOff = sign.length ? '            <p style="margin:0;">' + mdInline(sign[0], greeting) + '</p>' : '';
    var nameDiv = sign.length > 1 ? RH_NAME.replace('Emma-Louise Usher', function () { return mdInline(sign[1], greeting); }) : '';
    var titleDivs = sign.slice(2).map(function (l) { return RH_TITLE.replace('General Manager, Tara Rose Salons', function () { return mdInline(l, greeting); }); });
    var html = RH_HEAD.replace('Your application to Tara Rose Salons', function () { return esc(subject); }) + '\n' + paras.concat(signOff ? [signOff] : []).join('\n') + '\n' + RH_MID +
      (nameDiv ? '\n' + nameDiv : '') + (titleDivs.length ? '\n' + titleDivs.join('\n') : '') + '\n' + RH_TAIL;
    return { subject: subject, text: text, html: html };
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
  var NO_WORDS = function () { return setting('decline_confirmed', false) ? '' : '<p class="rct-amberbox">The signature (Emma-Louise Usher, General Manager) is not confirmed yet. Check it under Booking link and replies and tick Signature confirmed.</p>'; };
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

  function shortDialog(id) {
    var p = personById(id); if (!p) return;
    var txt = fill(setting('invite_template', ''), p), hasLink = !!setting('booking_link', '');
    openDlg('Invite ' + esc(firstName(p.name)) + ' to interview',
      '<div><div class="rct-lab">Booking link</div>' + (hasLink ? '<p class="rct-linkline">' + esc(setting('booking_link', '')) + '</p>' : '<p class="rct-amberbox">Not set yet. <button type="button" class="rct-linkbtn" data-act="settings">Set the booking link</button></p>') + '</div>' +
      '<div><div class="rct-lab">Reply, ready to send</div><pre class="rct-reply" id="rctReply">' + esc(txt) + '</pre>' +
      (setting('templates_confirmed', false) ? '' : '<p class="rct-hint">Placeholder wording until you save your own under Booking link and replies. Every template goes through the brand review before it is used.</p>') + '</div>' +
      (p.bounced ? '<p class="rct-amberbox">Their email bounced. Message them on WhatsApp instead.</p>' : '') +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="invite" data-id="' + esc(p.id) + '">Mark as invited</button><button type="button" class="rct-btn" data-act="copy">Copy reply</button></div>' +
      (p.email && !p.bounced ? '<a class="rct-btn rct-sm" href="' + esc(composeUrl(p.email, 'Your application to Tara Rose', txt)) + '" target="_blank" rel="noopener">Open in Gmail from the recruitment inbox</a>' : '') +
      '<p class="rct-hint">The dashboard does not send email. Send the reply, then press Mark as invited so they move to Screening.</p>');
  }
  // Only people someone has looked at: the reply says "I have reviewed your application", so it must be true for every one of them.
  function bulkReviewed(g) { return (noGroups()[g] || []).filter(isReviewed); }
  function bulkDialog(g) {
    var all = noGroups()[g] || []; if (!all.length) return;
    var list = all.filter(isReviewed), skipped = all.length - list.length;
    var name = { abroad: 'Not based in the UAE', noig: 'No Instagram given', role: 'Role not on your open list' }[g];
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
  function settingsDialog() {
    openDlg('Booking link and replies',
      '<label class="rct-field"><span>Booking link (the calendar page candidates choose a time on)</span><input type="url" id="rctLink" value="' + esc(setting('booking_link', '')) + '" placeholder="https://"></label>' +
      '<label class="rct-field"><span>Invite reply. {first} becomes their first name and {link} the booking link.</span><textarea id="rctInv" rows="6">' + esc(setting('invite_template', '')) + '</textarea></label>' +
      '<label class="rct-field"><span>The No email: subject</span><input type="text" id="rctSub" value="' + esc(setting('decline_subject', DEFAULT_SUBJECT)) + '"></label>' +
      '<label class="rct-field"><span>The No email: wording. The first line {greeting} becomes Hi and their first name (or Hi there,). Use **bold** and [link text]({careers_url}). The last block is the signature: sign-off, name, title.</span><textarea id="rctDec" rows="14">' + esc(setting('decline_template', DEFAULT_DECLINE)) + '</textarea></label>' +
      '<div><button type="button" class="rct-btn rct-sm" data-act="usedefault">Put the approved wording back</button></div>' +
      '<label class="rct-check"><input type="checkbox" id="rctSig"' + (setting('decline_confirmed', false) ? ' checked' : '') + '> Signature confirmed by Emma-Louise (name and title)</label>' +
      '<label class="rct-check"><input type="checkbox" id="rctOk"' + (setting('templates_confirmed', false) ? ' checked' : '') + '> The invite reply above is the final wording (it has been through the brand review)</label>' +
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
    var r = await sb.rpc('recruit_set_photo', { p_id: p.id, p_path: path });
    if (r.error) { try { await bucket.remove([path]); } catch (e) { /* stray file, harmless */ } throw new Error(r.error.message); }
    var old = r.data && r.data.old;
    if (old && old !== path) { try { await bucket.remove([old]); } catch (e) { /* harmless */ } delete PHOTO[old]; }
    p.photo = path;
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
  function pickPhoto(id) {
    var p = personById(id); if (!p) return;
    photoFor = String(p.id);
    openDlg('Photo for ' + esc(p.name || 'this person'),
      '<div class="rct-pastebox" id="rctPasteBox" tabindex="0" role="button" aria-label="Paste or drop a picture here">' +
        '<b>Paste a picture here</b><span>Copy an image (right click, Copy image), then press Ctrl+V. Or drop an image on this box.</span></div>' +
      '<p class="rct-pasteacts"><button type="button" class="rct-btn rct-sm" data-act="photofile" data-id="' + esc(p.id) + '">Choose a file instead</button>' +
      (p.photo ? '<button type="button" class="rct-btn rct-sm" data-act="photoclear" data-id="' + esc(p.id) + '">Remove photo</button>' : '') + '</p>');
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
      var r = await sb.rpc('recruit_clear_photo', { p_id: p.id });
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

  function toast(msg, undo) {
    var host = document.getElementById('rctToast');
    if (!host) { host = document.createElement('div'); host.id = 'rctToast'; document.body.appendChild(host); }
    host.innerHTML = '<div class="rct-toast" role="status"><span>' + esc(msg) + '</span>' + (undo ? '<button type="button" data-undo>Undo</button>' : '') + '</div>';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { host.innerHTML = ''; }, 7000);
  }
  async function setStage(ids, stage, msg) {
    var prev = ids.map(function (id) { var p = personById(id); return { id: id, stage: p ? p.stage : 'new', by: p ? p.decided_by : null, at: p ? p.decided_at : null }; });
    try {
      var r = await sb.rpc('recruit_set_stage', { p_ids: ids, p_stage: stage });
      if (r.error) throw new Error(r.error.message);
    } catch (e) { console.error(e); toast('That did not save: ' + (e.message || 'try again')); return false; }
    var now = new Date().toISOString();
    ids.forEach(function (id) { var p = personById(id); if (p) { p.stage = stage; p.decided_by = stage === 'new' ? null : me; p.decided_at = stage === 'new' ? null : now; } });
    UNDO.push(prev); render();
    if (msg) toast(msg, true);
    return true;
  }
  async function undo() {
    var prev = UNDO.pop(); if (!prev) return;
    var groups = {};
    prev.forEach(function (x) { (groups[x.stage] = groups[x.stage] || []).push(x.id); });
    try {
      for (var st in groups) { var r = await sb.rpc('recruit_set_stage', { p_ids: groups[st], p_stage: st }); if (r.error) throw new Error(r.error.message); }
    } catch (e) { console.error(e); toast('Undo did not save: ' + (e.message || 'try again')); return; }
    prev.forEach(function (x) { var p = personById(x.id); if (p) { p.stage = x.stage; p.decided_by = x.by; p.decided_at = x.at; } });
    render(); toast('Undone.');
  }
  async function saveSetting(k, v) {
    var r = await sb.rpc('recruit_settings_set', { p_key: k, p_value: v });
    if (r.error) throw new Error(r.error.message);
    settings[k] = v;
  }

  /* ---------- events ---------- */
  function bind() {
    var el = main(); if (!el || el.__rctBound) return;
    el.__rctBound = true;
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
      if (t.hasAttribute('data-fig') || t.hasAttribute('data-lane')) { var k0 = t.getAttribute('data-fig') || t.getAttribute('data-lane'); S.lane = S.lane === k0 ? null : k0; S.filters = {}; closePop(); render(); return; }
      if (t.hasAttribute('data-mode')) { setMode(t.getAttribute('data-mode')); return; }
      if (t.hasAttribute('data-fcol')) { var fc = t.getAttribute('data-fcol'); if (!pop.hidden && popCol === fc) closePop(); else openPop(fc, t); return; }
      if (t.hasAttribute('data-sort')) { S.sort = { col: popCol, dir: t.getAttribute('data-sort') }; var sc0 = popCol; renderKeep(); reopenPop(sc0); return; }
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
      if (a === 'short') shortDialog(id);
      else if (a === 'invite') { if (await setStage([id], 'screening', 'Moved to Screening.')) closeDlg(); }
      else if (a === 'booked') setStage([id], 'interview_booked', 'Moved to Interview booked.');
      // No: the person is marked Not now (that also counts as reviewed), then the reply is offered. Nothing is sent by the site.
      else if (a === 'no') { if (await setStage([id], 'not_now', 'Not now for ' + firstName(p && p.name) + '.')) noDialog(id); }
      else if (a === 'reply') { markReviewed([id]); noDialog(id); }
      else if (a === 'look') { openRows[id] = !openRows[id]; if (openRows[id]) markReviewed([id]); render(); }
      else if (a === 'back') setStage([id], 'new', 'Put back in the list.');
      else if (a === 'bulk') bulkDialog(g);
      else if (a === 'bulkgo') { var ids = bulkReviewed(g).map(function (x) { return x.id; }); if (ids.length && await setStage(ids, 'not_now', 'Not now for ' + pl(ids.length, 'person', 'people') + '.')) closeDlg(); }
      else if (a === 'copy') { var r = document.getElementById('rctReply'); try { await navigator.clipboard.writeText(r ? r.textContent : ''); t.textContent = 'Copied'; } catch (err) { t.textContent = 'Select the text and copy'; } }
      else if (a === 'copyno') { var rp1 = replyParts(p, false), res1 = await copyRich(rp1.html, rp1.text); t.textContent = res1 === 'rich' ? 'Copied, with formatting' : res1 === 'plain' ? 'Copied as plain text' : 'Copy did not work here'; }
      else if (a === 'copybulk') { var rp2 = replyParts(null, true), res2 = await copyRich(rp2.html, rp2.text); t.textContent = res2 === 'rich' ? 'Reply copied, with formatting' : res2 === 'plain' ? 'Reply copied as plain text' : 'Copy did not work here'; }
      else if (a === 'copyemails') { var em = bulkReviewed(g).map(function (x) { return x.email; }).filter(Boolean).join(', '); try { await navigator.clipboard.writeText(em); t.textContent = 'Copied'; } catch (err) { t.textContent = 'Copy did not work here'; } }
      else if (a === 'settings') settingsDialog();
      else if (a === 'usedefault') { document.getElementById('rctDec').value = DEFAULT_DECLINE; document.getElementById('rctSub').value = DEFAULT_SUBJECT; var sy = document.getElementById('rctSay'); if (sy) sy.textContent = 'The approved wording is back in the box. Press Save to keep it.'; }
      else if (a === 'savesettings') {
        var say = document.getElementById('rctSay'); if (say) say.textContent = 'Saving.';
        try {
          await saveSetting('booking_link', (document.getElementById('rctLink').value || '').trim());
          await saveSetting('invite_template', document.getElementById('rctInv').value);
          await saveSetting('decline_template', document.getElementById('rctDec').value);
          await saveSetting('decline_subject', (document.getElementById('rctSub').value || '').trim() || DEFAULT_SUBJECT);
          await saveSetting('templates_confirmed', !!document.getElementById('rctOk').checked);
          await saveSetting('decline_confirmed', !!document.getElementById('rctSig').checked);
          closeDlg(); render(); toast('Saved.');
        } catch (err) { console.error(err); if (say) say.textContent = 'That did not save: ' + err.message; }
      }
      else if (a === 'toggledone') { S.showDone = !S.showDone; render(); }
      else if (a === 'clearfilters') { S.filters = {}; q = ''; closePop(); render(); }
      else if (a === 'photo') pickPhoto(id);
      else if (a === 'photofile') pickPhotoFile(id);
      else if (a === 'photoclear') clearPhoto(id);
      else if (a === 'photobulk') pickBulk();
      else if (a === 'pgprev') { S.page = Math.max(0, S.page - 1); render(); }
      else if (a === 'pgnext') { S.page += 1; render(); }
      else if (a === 'morelook') { shownLook += PAGE; render(); }
      else if (a === 'moreno') { shownNo[g] = (shownNo[g] || PAGE) + PAGE; render(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'rctRoles') { e.preventDefault(); e.target.blur(); } });
    document.addEventListener('change', async function (e) {
      if (e.target && e.target.id === 'rctRoles') {
        var v = e.target.value.replace(/\s*[,;]\s*/g, ', ').replace(/^[,\s]+|[,\s]+$/g, ''), was = settings.open_roles_text;
        settings.open_roles_text = v; render();
        try { await saveSetting('open_roles_text', v); toast(v ? 'Hiring for: ' + v + '.' : 'No roles listed, so nobody is moved for their role.'); }
        catch (err) { console.error(err); settings.open_roles_text = was; render(); toast('That did not save: ' + err.message); }
        return;
      }
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
      var r = await sb.rpc('recruit_get');
      if (r.error) throw new Error(r.error.message);
      C = r.data || null;
      if (!C) throw new Error('No data came back.');
      rows = C.rows || []; settings = C.settings || {}; me = C.me || '';
      await loadPhotoUrls();
    } catch (e) {
      console.error(e); C = null; loadErr = 'The applicants could not be read just now (' + (e.message || 'unknown') + '). Refresh the page to try again.';
    }
    if (main() && main().offsetParent !== null) render();
  };
  // only used by the local test harness (it sets window.__RCT_TEST__ first); nothing on the live site sets it
  if (window.__RCT_TEST__) window.__rctTest = { replyParts: replyParts, greetingFor: greetingFor, setSettings: function (s) { settings = s; } };
})();
