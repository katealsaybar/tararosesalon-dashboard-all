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
  var PAGE = 12;
  var C = null, loadErr = '', rows = [], settings = {}, me = '', q = '', shownLook = PAGE, shownNo = {}, bound = false, toastTimer = null;
  var UNDO = [];

  function setting(k, d) { return settings[k] == null ? d : settings[k]; }
  function openRoles() { return setting('open_roles', { stylist: true, colourist: true, beauty: true, nails: true }); }
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
    var open = openRoles();
    if (p.role_key && p.role_key !== 'other' && open[p.role_key] === false) {
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
  function igHtml(p) {
    var u = igUrl(p);
    if (hasIg(p)) {
      var label = p.ig_handle ? '@' + String(p.ig_handle).replace(/^@/, '') : 'Instagram';
      return u ? '<a class="rct-ig" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label) + '</a>' : esc(label);
    }
    var other = safeUrl(p.work_link);
    if (other) return '<span class="rct-none">No Instagram</span> <a class="rct-ig" href="' + esc(other) + '" target="_blank" rel="noopener">their link</a>';
    return p.source === 'form' ? '<span class="rct-none">None given</span>' : '<span class="rct-ns">Not stated</span>';
  }
  function linksHtml(p) {
    var s = '', cv = safeUrl(p.cv_link);
    if (cv) s += '<a href="' + esc(cv) + '" target="_blank" rel="noopener">CV</a>';
    if (p.email) s += '<a href="https://mail.google.com/mail/?authuser=recruitment@tararosesalon.com#search/' + encodeURIComponent(p.email) + '" target="_blank" rel="noopener">Their emails in Gmail</a>';
    var wa = String(p.whatsapp || '').replace(/\D/g, '');
    if (wa.length >= 9) s += '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>';
    return s ? '<div class="rct-links">' + s + '</div>' : '';
  }
  function aboutHtml(p) {
    if (!p.about) return '';
    return '<details class="rct-about"><summary>What they wrote</summary><p>' + esc(p.about) + '</p></details>';
  }
  function roleLine(p) { return esc(p.role_txt || p.paths || p.specialist || '') || '<span class="rct-ns">Not stated</span>'; }

  function card(p) {
    return '<article class="rct-card">' +
      '<div class="rct-ctop"><h3>' + esc(p.name || 'Name not stated') + '</h3><div class="rct-pills">' + waitPill(p) + extraPills(p) + '</div></div>' +
      '<div class="rct-facts">' +
        '<div class="rct-fact"><span>Based in</span><b>' + placeOf(p) + '</b></div>' +
        '<div class="rct-fact"><span>Instagram</span><b>' + igHtml(p) + '</b></div>' +
        '<div class="rct-fact"><span>Experience</span><b>' + stated(p.experience) + '</b></div>' +
        '<div class="rct-fact"><span>Applying for</span><b>' + roleLine(p) + '</b></div>' +
        '<div class="rct-fact"><span>Applied</span><b>' + esc(fat(p.applied_at)) + ' <span class="rct-src">(' + (p.source === 'form' ? 'website form' : 'email') + (p.merged > 1 ? ', ' + p.merged + ' emails merged' : '') + ')</span></b></div>' +
      '</div>' + aboutHtml(p) + linksHtml(p) +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="short" data-id="' + esc(p.id) + '">Shortlist</button>' +
      '<button type="button" class="rct-btn" data-act="no" data-id="' + esc(p.id) + '">Not now</button></div></article>';
  }
  function row(p) {
    var why = flags(p).map(function (f) { return f.t; }).join(' and ');
    var sub = p.stage === 'new' ? (why || (p.role_txt || '')) :
              p.stage === 'screening' ? 'Invite sent ' + fat(p.decided_at) + ', not booked yet' :
              p.stage === 'interview_booked' ? 'Interview booked, moved ' + fat(p.decided_at) :
              p.stage === 'not_now' || p.stage === 'rejected' ? (STAGE_LABEL[p.stage] + ' ' + fat(p.decided_at)) : (STAGE_LABEL[p.stage] || '');
    var acts = '';
    if (p.stage === 'new') acts = '<button type="button" class="rct-btn rct-sm" data-act="short" data-id="' + esc(p.id) + '">Shortlist</button>' +
                                  '<button type="button" class="rct-btn rct-sm" data-act="no" data-id="' + esc(p.id) + '">' + (flags(p).length ? 'Say no' : 'Not now') + '</button>';
    else if (p.stage === 'screening') acts = '<button type="button" class="rct-btn rct-sm" data-act="booked" data-id="' + esc(p.id) + '">Interview booked</button><button type="button" class="rct-btn rct-sm" data-act="short" data-id="' + esc(p.id) + '">Invite again</button>';
    else if (p.stage === 'not_now' || p.stage === 'rejected') acts = '<button type="button" class="rct-btn rct-sm" data-act="back" data-id="' + esc(p.id) + '">Put back</button>';
    var det = [p.emirate || p.country, p.experience, p.role_txt].filter(Boolean).map(esc).join(' &middot; ');
    return '<div class="rct-row"><div class="rct-who"><b>' + esc(p.name || 'Name not stated') + '</b>' +
      (det ? '<span>' + det + '</span>' : '') + '<span>' + esc(sub) + '</span></div>' +
      '<div class="rct-acts">' + waitPill(p) + extraPills(p) + stagePill(p) + acts + '</div></div>';
  }
  var GROUPS = [['abroad', 'Not based in the UAE'], ['noig', 'No Instagram given'], ['role', 'Role not on your open list']];
  function noGroups() {
    var g = { abroad: [], noig: [], role: [] };
    by('no').forEach(function (p) { g[flags(p)[0].k].push(p); });
    return g;
  }
  function fig(key, n, label, cls) {
    return '<button type="button" class="rct-fig ' + (cls || '') + '" data-fig="' + key + '"><span class="rct-n">' + n + '</span><span class="rct-l">' + label + '</span></button>';
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
         '<button type="button" class="rct-btn rct-sm" data-act="settings">Booking link and replies</button></div>';

    if (!setting('booking_link', '') || !setting('templates_confirmed', false)) {
      h += '<p class="rct-note rct-amberbox">' + (!setting('booking_link', '') ? 'The booking link is not set yet. ' : '') +
           (!setting('templates_confirmed', false) ? 'The reply wording is still placeholder text until you save your own. ' : '') +
           '<button type="button" class="rct-linkbtn" data-act="settings">Set them now</button></p>';
    }

    var open = openRoles();
    h += '<div class="rct-roles"><div class="rct-lab">What we are hiring for right now</div><div class="rct-rolechips">' +
      ROLES.map(function (r) { var on = open[r[0]] === true; return '<button type="button" class="' + (on ? 'rct-on' : '') + '" data-role="' + r[0] + '" aria-pressed="' + on + '">' + esc(r[1]) + '</button>'; }).join('') +
      '</div><p class="rct-hint">Tap a role to switch it on or off. Anyone applying for a role that is off moves to Probably no.</p></div>';

    if (q.trim().length >= 2) {
      var f = found();
      h += '<section class="rct-sec"><div class="rct-sech"><h2>Found<span class="rct-cnt">' + f.length + '</span></h2></div>' +
        (f.length ? '<div class="rct-card rct-list">' + f.slice(0, 40).map(row).join('') + (f.length > 40 ? '<p class="rct-hint">Showing the first 40. Type more to narrow it.</p>' : '') + '</div>' : '<div class="rct-empty">Nobody matches that.</div>') + '</section>';
      el.innerHTML = h + '</div>'; return;
    }

    h += '<section class="rct-sec"><div class="rct-sech"><h2>Worth a look<span class="rct-cnt">' + look.length + '</span></h2><span class="rct-hint">Longest waiting first. All checks passed.</span></div>';
    h += look.length ? '<div class="rct-cards">' + look.slice(0, shownLook).map(card).join('') + '</div>' +
      (look.length > shownLook ? '<button type="button" class="rct-btn rct-sm rct-more" data-act="morelook">Show ' + Math.min(PAGE, look.length - shownLook) + ' more (' + (look.length - shownLook) + ' left)</button>' : '')
      : '<div class="rct-empty">Nobody waiting for your decision. The next application will appear here.</div>';
    h += '</section>';

    h += '<section class="rct-sec"><div class="rct-sech"><h2>Probably no<span class="rct-cnt">' + no.length + '</span></h2><span class="rct-hint">Opened by reason. Mark a whole group Not now in one tap, or put one person back.</span></div>';
    var g = noGroups(), openG = {};
    var cur = el.querySelectorAll('details.rct-grp[open]'); for (var i = 0; i < cur.length; i++) openG[cur[i].getAttribute('data-g')] = true;
    GROUPS.forEach(function (gr) {
      var list = g[gr[0]]; if (!list.length) return;
      var n = shownNo[gr[0]] || PAGE;
      h += '<details class="rct-grp" data-g="' + gr[0] + '"' + (openG[gr[0]] ? ' open' : '') + '><summary><span>' + gr[1] + '<span class="rct-cnt">' + list.length + '</span></span></summary><div class="rct-dbody">' +
        '<div class="rct-bulk"><span>Mark all ' + list.length + ' in this group Not now.</span><button type="button" class="rct-btn rct-sm rct-danger" data-act="bulk" data-g="' + gr[0] + '">Not now for all ' + list.length + '</button></div>' +
        list.slice(0, n).map(row).join('') +
        (list.length > n ? '<button type="button" class="rct-btn rct-sm rct-more" data-act="moreno" data-g="' + gr[0] + '">Show ' + Math.min(PAGE, list.length - n) + ' more (' + (list.length - n) + ' left)</button>' : '') +
        '</div></details>';
    });
    if (!no.length) h += '<div class="rct-empty">Nothing flagged right now.</div>';
    h += '</section>';

    var prog = rows.filter(function (p) { var b = bucket(p); return b === 'invited' || b === 'booked' || b === 'later'; });
    h += '<section class="rct-sec"><div class="rct-sech"><h2>In progress<span class="rct-cnt">' + prog.length + '</span></h2></div><div class="rct-card rct-list">' +
      (prog.length ? prog.map(row).join('') : '<p class="rct-hint">No one yet.</p>') + '</div></section>';

    var done = rows.filter(function (p) { return bucket(p) === 'done'; }).sort(function (a, c) { return new Date(c.decided_at || 0) - new Date(a.decided_at || 0); });
    h += '<details class="rct-grp rct-donebox" data-g="done"><summary><span>Not now<span class="rct-cnt">' + done.length + '</span></span></summary><div class="rct-dbody">' +
      (done.length ? done.slice(0, 30).map(row).join('') + (done.length > 30 ? '<p class="rct-hint">Showing the latest 30.</p>' : '') : '<p class="rct-hint">No one yet.</p>') + '</div></details>';
    h += '<p class="rct-note">Stage names are the TRS Recruitment labels already in the inboxes. The dashboard never sends email: Shortlist gives you the reply to send from the recruitment inbox. Waiting counts days since the application with no human reply; the automatic brochure email does not count.</p>';
    el.innerHTML = h + '</div>';
    if (q) { var inp = document.getElementById('rctFind'); if (inp && document.activeElement !== inp && inp.__keep) inp.focus(); }
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

  function figDialog(key) {
    var titles = { look: 'Worth a look', no: 'Probably no', late: 'Waiting ' + waitDays() + ' days or more', invited: 'Invited, not booked yet', booked: 'Interview booked' };
    var list = key === 'late' ? lateList() : by(key);
    openDlg(esc(titles[key]) + ' (' + list.length + ')', '<div class="rct-list">' + (list.length ? list.slice(0, 60).map(row).join('') + (list.length > 60 ? '<p class="rct-hint">Showing the first 60.</p>' : '') : '<div class="rct-empty">No one here.</div>') + '</div>');
  }
  function fill(t, p) {
    var link = setting('booking_link', '') || '[booking link not set yet]';
    return String(t || '').replace(/\{first\}/g, firstName(p && p.name)).replace(/\{link\}/g, link);
  }
  function composeUrl(to, subject, body) {
    return 'https://mail.google.com/mail/?authuser=recruitment@tararosesalon.com&view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
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
  function bulkDialog(g) {
    var list = noGroups()[g] || []; if (!list.length) return;
    var name = { abroad: 'Not based in the UAE', noig: 'No Instagram given', role: 'Role not on your open list' }[g];
    var txt = fill(setting('decline_template', ''), null).replace(/Hi there,/, 'Hi [first name],');
    var emails = list.map(function (p) { return p.email; }).filter(Boolean);
    openDlg('Mark ' + list.length + ' people Not now?',
      '<p>Group: <b>' + esc(name) + '</b>. This moves them to <b>Not now</b> and out of your list. You can undo for a few seconds, or put one back later. <b>Nothing is sent from the dashboard.</b></p>' +
      '<div class="rct-card rct-list rct-flat">' + list.slice(0, 15).map(function (p) { return '<div class="rct-row"><div class="rct-who"><b>' + esc(p.name || 'Name not stated') + '</b><span>' + esc([p.emirate, p.country].filter(Boolean).join(', ')) + '</span></div><div class="rct-acts">' + waitPill(p) + '</div></div>'; }).join('') + (list.length > 15 ? '<p class="rct-hint">and ' + (list.length - 15) + ' more.</p>' : '') + '</div>' +
      '<div><div class="rct-lab">If you want to tell them, the reply</div><pre class="rct-reply">' + esc(txt) + '</pre>' +
      (setting('templates_confirmed', false) ? '' : '<p class="rct-hint">Placeholder wording until you save your own.</p>') + '</div>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-danger" data-act="bulkgo" data-g="' + esc(g) + '">Yes, Not now for all ' + list.length + '</button><button type="button" class="rct-btn" data-close>Cancel</button></div>' +
      (emails.length ? '<button type="button" class="rct-btn rct-sm" data-act="copyemails" data-g="' + esc(g) + '">Copy the ' + pl(emails.length, 'email address', 'email addresses') + ' to paste into Bcc</button>' : ''));
  }
  function settingsDialog() {
    openDlg('Booking link and replies',
      '<label class="rct-field"><span>Booking link (the calendar page candidates choose a time on)</span><input type="url" id="rctLink" value="' + esc(setting('booking_link', '')) + '" placeholder="https://"></label>' +
      '<label class="rct-field"><span>Invite reply. {first} becomes their first name and {link} the booking link.</span><textarea id="rctInv" rows="6">' + esc(setting('invite_template', '')) + '</textarea></label>' +
      '<label class="rct-field"><span>Polite no reply</span><textarea id="rctDec" rows="5">' + esc(setting('decline_template', '')) + '</textarea></label>' +
      '<label class="rct-check"><input type="checkbox" id="rctOk"' + (setting('templates_confirmed', false) ? ' checked' : '') + '> This is the final wording (it has been through the brand review)</label>' +
      '<div class="rct-btns"><button type="button" class="rct-btn rct-pri" data-act="savesettings">Save</button><button type="button" class="rct-btn" data-close>Cancel</button></div><p class="rct-say" id="rctSay" role="status"></p>');
  }

  /* ---------- saving ---------- */
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
      var t = e.target.closest && e.target.closest('[data-act],[data-fig],[data-role],[data-close],[data-undo]');
      if (!t) return;
      var inMain = main() && main().contains(t), inDlg = dlg().contains(t), inToast = document.getElementById('rctToast') && document.getElementById('rctToast').contains(t);
      if (!inMain && !inDlg && !inToast) return;
      if (t.hasAttribute('data-close')) { closeDlg(); return; }
      if (t.hasAttribute('data-undo')) { undo(); return; }
      if (t.hasAttribute('data-fig')) { figDialog(t.getAttribute('data-fig')); return; }
      if (t.hasAttribute('data-role')) {
        var k = t.getAttribute('data-role'), open = Object.assign({}, openRoles()); open[k] = !(open[k] === true);
        var was = settings.open_roles; settings.open_roles = open; render();
        try { await saveSetting('open_roles', open); } catch (err) { console.error(err); settings.open_roles = was; render(); toast('That did not save: ' + err.message); }
        return;
      }
      var a = t.getAttribute('data-act'), id = t.getAttribute('data-id'), g = t.getAttribute('data-g'), p = id ? personById(id) : null;
      if (a === 'short') shortDialog(id);
      else if (a === 'invite') { if (await setStage([id], 'screening', 'Moved to Screening.')) closeDlg(); }
      else if (a === 'booked') setStage([id], 'interview_booked', 'Moved to Interview booked.');
      else if (a === 'no') setStage([id], 'not_now', 'Not now for ' + firstName(p && p.name) + '.');
      else if (a === 'back') setStage([id], 'new', 'Put back in the list.');
      else if (a === 'bulk') bulkDialog(g);
      else if (a === 'bulkgo') { var ids = (noGroups()[g] || []).map(function (x) { return x.id; }); if (ids.length && await setStage(ids, 'not_now', 'Not now for ' + pl(ids.length, 'person', 'people') + '.')) closeDlg(); }
      else if (a === 'copy') { var r = document.getElementById('rctReply'); try { await navigator.clipboard.writeText(r ? r.textContent : ''); t.textContent = 'Copied'; } catch (err) { t.textContent = 'Select the text and copy'; } }
      else if (a === 'copyemails') { var em = (noGroups()[g] || []).map(function (x) { return x.email; }).filter(Boolean).join(', '); try { await navigator.clipboard.writeText(em); t.textContent = 'Copied'; } catch (err) { t.textContent = 'Copy did not work here'; } }
      else if (a === 'settings') settingsDialog();
      else if (a === 'savesettings') {
        var say = document.getElementById('rctSay'); if (say) say.textContent = 'Saving.';
        try {
          await saveSetting('booking_link', (document.getElementById('rctLink').value || '').trim());
          await saveSetting('invite_template', document.getElementById('rctInv').value);
          await saveSetting('decline_template', document.getElementById('rctDec').value);
          await saveSetting('templates_confirmed', !!document.getElementById('rctOk').checked);
          closeDlg(); render(); toast('Saved.');
        } catch (err) { console.error(err); if (say) say.textContent = 'That did not save: ' + err.message; }
      }
      else if (a === 'morelook') { shownLook += PAGE; render(); }
      else if (a === 'moreno') { shownNo[g] = (shownNo[g] || PAGE) + PAGE; render(); }
    });
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
    } catch (e) {
      console.error(e); C = null; loadErr = 'The applicants could not be read just now (' + (e.message || 'unknown') + '). Refresh the page to try again.';
    }
    if (main() && main().offsetParent !== null) render();
  };
})();
