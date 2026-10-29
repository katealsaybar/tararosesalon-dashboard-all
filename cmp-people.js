// Complaint people (Kate, 29 Oct 2026, complaint triage batch 2). Shared by Log a Complaint on the dashboard (complaint-log.js) and the complaint
// ticket on Team Home (hub/complaint.html), so the same list, the same dots and the same picker are used wherever a person is chosen:
// who was involved, who else should know, tag a person, assign, and @ in a note.
//
// The list is cmp_people_options() (the table complaint_taggers: only people who work in Log a Complaint). Online dots: green = on the site now
// (Realtime Presence, site-presence.js, or a visit in the last 6 minutes), grey = not on it, with when they were last there, hollow = never signed in.
// The dots only inform. They never skip anyone.
(function () {
  if (window.CmpPeople) return;
  var GROUPS = [['leadership', 'Leadership'], ['educator', 'Educators'], ['coordinator', 'Salon coordinators'], ['reception', 'Reception'], ['callcentre', 'Call centre']];
  var CP = window.CmpPeople = { list: [], at: 0, byEmail: {}, groups: GROUPS, subs: [] };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  CP.esc = esc;

  function client() {
    try { if (typeof sb !== 'undefined' && sb && sb.rpc) return sb; } catch (e) {}
    return (window.KB && window.KB.client) || null;
  }
  CP.client = client;

  CP.load = async function (force) {
    if (!force && CP.list.length && Date.now() - CP.at < 60000) return CP.list;
    var c = client();
    if (!c) return CP.list;
    var r = await c.rpc('cmp_people_options');
    if (r.error) { console.error(r.error); return CP.list; }
    CP.list = r.data || [];
    CP.at = Date.now();
    CP.byEmail = {};
    CP.list.forEach(function (p) { CP.byEmail[p.email] = p; });
    return CP.list;
  };

  CP.ago = function (ts) {
    var m = Math.max(1, Math.round((Date.now() - Date.parse(ts)) / 60000));
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  };
  // 'on' | 'off' | 'none'
  CP.state = function (p) {
    if (!p) return 'none';
    var live = window.TrsPresence && window.TrsPresence.online && window.TrsPresence.online[String(p.email).toLowerCase()];
    if (live || (p.last_seen && Date.now() - Date.parse(p.last_seen) < 6 * 60000)) return 'on';
    return p.ever ? 'off' : 'none';
  };
  CP.seen = function (p) {
    var s = CP.state(p);
    if (s === 'on') return 'on the site now';
    if (s === 'none') return 'never signed in';
    return p.last_seen ? 'last on the site ' + CP.ago(p.last_seen) : 'not on the site now';
  };
  CP.dot = function (p) {
    var s = CP.state(p);
    return '<i class="od ' + s + '" role="img" aria-label="' + esc(CP.seen(p)) + '"></i>';
  };
  CP.legend = function () {
    return '<div class="cmp-legend"><span><i class="od on"></i>on the site now</span><span><i class="od off"></i>not on it</span><span><i class="od none"></i>never signed in</span></div>';
  };
  CP.byEmailOrName = function (email, name) {
    if (email && CP.byEmail[String(email).toLowerCase()]) return CP.byEmail[String(email).toLowerCase()];
    var n = String(name || '').toLowerCase();
    return CP.list.filter(function (p) { return p.short.toLowerCase() === n; })[0] || null;
  };
  CP.where = function (p) { return p.branch && !/,/.test(p.role) ? ', ' + ({ SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', BAH: 'Bahrain' })[p.branch] : ''; };

  // one row of a picker: the dot, the name, what they do, when they were last on
  CP.row = function (p, o) {
    o = o || {};
    return '<button type="button" class="cmp-pr' + (o.cls ? ' ' + o.cls : '') + '" data-pick="' + esc(p.email) + '"' + (o.disabled ? ' disabled' : '') + '>' +
      CP.dot(p) + '<span class="cmp-pn">' + esc(p.short) + '</span><span class="cmp-pr2"><span>' + esc(p.role) + '</span><span class="cmp-ps">' + esc(CP.seen(p)) + '</span></span>' +
      (o.badge ? '<em>' + esc(o.badge) + '</em>' : '') + '</button>';
  };

  // the people matching what was typed, grouped; exclude = emails to leave out, badges = { email: 'tagged' }
  CP.listHtml = function (q, o) {
    o = o || {};
    var ex = o.exclude || {}, badges = o.badges || {};
    var n = String(q || '').toLowerCase().trim();
    var rows = CP.list.filter(function (p) {
      if (ex[p.email]) return false;
      if (!n) return true;
      return (p.name + ' ' + p.short + ' ' + p.role).toLowerCase().indexOf(n) >= 0;
    });
    if (!rows.length) return '<p class="cmp-none">' + (CP.list.length ? 'Nobody on the list matches that.' : 'The list did not load. Refresh to try again.') + '</p>';
    if (n) return '<div class="cmp-grp">' + rows.map(function (p) { return CP.row(p, { badge: badges[p.email], disabled: !!badges[p.email] && o.lockBadged }); }).join('') + '</div>';
    return GROUPS.map(function (g) {
      var rs = rows.filter(function (p) { return p.grp === g[0]; });
      return rs.length ? '<div class="cmp-gl">' + esc(g[1]) + '</div><div class="cmp-grp">' + rs.map(function (p) { return CP.row(p, { badge: badges[p.email], disabled: !!badges[p.email] && o.lockBadged }); }).join('') + '</div>' : '';
    }).join('');
  };

  // a whole picker inside el: a search box and the list. onPick(person) is called on a click; it stays open until you close it.
  CP.mount = function (el, o) {
    o = o || {};
    el.classList.add('cmp-picker');
    el.innerHTML = '<input type="search" class="cmp-q" placeholder="Search a name" aria-label="Search a name" autocomplete="off"><div class="cmp-list" role="listbox"></div>' + CP.legend();
    var q = el.querySelector('.cmp-q'), list = el.querySelector('.cmp-list');
    var draw = function () { list.innerHTML = CP.listHtml(q.value, { exclude: typeof o.exclude === 'function' ? o.exclude() : o.exclude, badges: typeof o.badges === 'function' ? o.badges() : o.badges, lockBadged: o.lockBadged }); };
    q.addEventListener('input', draw);
    list.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-pick]');
      if (!b || b.disabled) return;
      var p = CP.byEmail[b.dataset.pick];
      if (p && o.onPick) o.onPick(p);
    });
    var handle = { draw: draw, focus: function () { q.focus(); } };
    CP.subs.push(function () { if (document.body.contains(el)) draw(); });
    CP.load().then(draw);
    draw();
    return handle;
  };

  if (window.TrsPresence) window.TrsPresence.onChange(function () { CP.subs.forEach(function (f) { f(); }); });
  else window.addEventListener('load', function () { if (window.TrsPresence) window.TrsPresence.onChange(function () { CP.subs.forEach(function (f) { f(); }); }); });

  // the styles, once. Colours come from the page (the dashboard and Team Home both define --surface, --border, --text, --muted).
  if (!document.getElementById('cmpPeopleCss')) {
    var st = document.createElement('style');
    st.id = 'cmpPeopleCss';
    st.textContent =
      '.od{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle;flex:none;background:#C9C4BA}' +
      '.od.on{background:#2F7A4B;box-shadow:0 0 0 3px rgba(47,122,75,.2)}' +
      '.od.none{background:transparent;border:1.5px solid #C9C4BA}' +
      '.cmp-legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:8px 0 0;font-size:12px;color:var(--muted,#777)}' +
      '.cmp-picker{border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff);padding:8px}' +
      '.cmp-q{width:100%;font:inherit;font-size:14px;padding:9px 12px;border-radius:10px;border:1.5px solid var(--border,#ddd);background:var(--bg,#fff);color:var(--text,#222);margin-bottom:4px;box-sizing:border-box}' +
      '.cmp-list{max-height:320px;overflow:auto}' +
      '.cmp-gl{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#777);margin:8px 6px 2px}' +
      '.cmp-grp{display:grid}' +
      '.cmp-pr{display:flex;align-items:center;gap:0;width:100%;text-align:left;font:inherit;font-size:14px;color:var(--text,#222);background:none;border:0;border-radius:9px;padding:8px 8px;cursor:pointer;min-height:40px}' +
      '.cmp-pr:hover:not(:disabled),.cmp-pr:focus-visible{background:var(--surface2,rgba(58,168,146,.12));outline:none}' +
      '.cmp-pr:disabled{opacity:.55;cursor:default}' +
      '.cmp-pn{font-weight:500;margin-right:auto}' +
      '.cmp-pr2{display:grid;text-align:right;font-size:12px;color:var(--muted,#777);line-height:1.3}' +
      '.cmp-pr2 .cmp-ps{font-size:11.5px;opacity:.85}' +
      '.cmp-pr em{font-style:normal;font-size:11.5px;margin-left:8px;border-radius:999px;padding:1px 8px;background:var(--surface2,#eee);color:var(--muted,#777)}' +
      '.cmp-none{font-size:13px;color:var(--muted,#777);margin:8px 6px}' +
      '.cmp-pills{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}' +
      '.cmp-pill{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;border:1.5px solid var(--border,#ddd);background:var(--surface,#fff);color:var(--text,#222);border-radius:999px;padding:6px 12px;cursor:pointer}' +
      '.cmp-pill.on{background:rgba(58,168,146,.14);border-color:#3AA892;color:inherit;font-weight:600}' +
      '.cmp-pill.fixed{cursor:default;border-style:dashed;font-weight:500}' +
      '.cmp-pill .x{opacity:.6;font-weight:400}' +
      '.cmp-lab{font-size:13px;font-weight:600;color:var(--muted,#777);margin:10px 0 2px}' +
      '.cmp-lab small{font-weight:400}';
    document.head.appendChild(st);
  }
})();
