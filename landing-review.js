/* Landing Page Review (Kate, 9 Nov 2026), a dashboard page in Tools (?view=landingreview), so the main sidebar stays. Tara and Coach Emma open a draft
   landing page from here, drop a pinned comment on the exact spot, and see what has been said on every page. The pins themselves are page-comments.js
   running on the landing page; this page only lists the pages and reads page_comments_get() (migrations/page_comments.sql, old Levels 3 and 5, checked again
   in the database). No table of its own: the list of pages is PAGES below, one line per page Kate sends. Layout (grid or list) is a personal setting
   (localStorage); V flips it, the same key as Google Drive. Needs only sb (the Supabase client) and TRS_LEVEL. */
(function () {
  function main() { return document.getElementById('landingReviewContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* One entry per landing page. slug = the folder under /campaigns/ and the key page_comments uses (a -r1 style suffix shares its page's comments).
     Every page is a draft until Kate says otherwise: nothing here says "live". */
  var PAGES = [
    { slug: 'keratin-smoothing', name: 'Keratin & Smoothing', tag: 'Draft for review', hue: 'a',
      who: 'For clients fighting frizz in Dubai and Abu Dhabi humidity. Prices by hair length.',
      img: '/campaigns/keratin-smoothing/og/keratin-smoothing.jpg' },
    { slug: 'extensions', name: 'Extensions', tag: 'Draft for review', hue: 'b',
      who: 'For clients choosing a method and a care plan. Five methods, matched to hair type.',
      img: '/campaigns/extensions/assets/img/hero-extensions.jpg' },
    { slug: 'blonde-standard-revised', name: 'Blonde Standard, revised', tag: 'Draft, 5 Nov feedback applied', hue: 'c',
      who: 'For clients who want to keep their blonde fresh all year. Version A and Version B are on the page.',
      img: '/campaigns/blonde-standard-revised/assets/img/inline-71bb1c2697.jpg',
      earlier: '/campaigns/blonde-standard/' },
    { slug: 'hair-rhythm', name: 'Hair Rhythm (junior campaign)', tag: 'Draft for review', hue: 'd',
      who: 'For clients on a regular trim, blow-dry and colour-care rhythm.',
      img: '/campaigns/hair-rhythm/assets/img/hero-junior.jpg',
      earlier: '/campaigns/hair-rhythm-r1/' }
  ];

  var KEY = 'trs-lpr-layout';
  var C = null, loadErr = false, filter = 'all', mode = 'grid', keyBound = false;

  function pl(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function fat(iso) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }).format(new Date(iso)); }
    catch (e) { return ''; }
  }
  function firstName(n) { return String(n || '').split(' ')[0]; }
  function savedMode() { try { return localStorage.getItem(KEY) === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; } }
  function saveMode(m) { try { localStorage.setItem(KEY, m); } catch (e) { /* private window */ } }
  function notFound() {
    var el = main(); if (el) el.innerHTML = '<p class="slv-muted">This page isn’t open to your account yet. Ask Kate to open Landing Page Review for you.</p>';
  }
  function openUrl(p, id) { return '/campaigns/' + p.slug + '/' + (id ? '?pc=' + encodeURIComponent(id) : ''); }

  // What the pins say about one page: top-level comments are pins, replies hang off them.
  function stats(p) {
    var rows = C ? C.comments.filter(function (c) { return c.page === p.slug; }) : [];
    var tops = rows.filter(function (c) { return c.parent == null; });
    var open = tops.filter(function (c) { return !c.resolved; });
    var done = tops.filter(function (c) { return c.resolved; });
    open.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return { open: open, done: done, any: tops.length > 0 };
  }
  function status(st) {
    if (!C) return { k: 'new', t: 'Open the page to comment' };
    if (!st.any) return { k: 'new', t: 'Not reviewed yet' };
    if (st.open.length) return { k: 'wait', t: pl(st.open.length, 'open comment', 'open comments') };
    return { k: 'done', t: 'All resolved' };
  }
  function visible(p) {
    var st = stats(p);
    if (filter === 'new') return !st.any;
    if (filter === 'open') return st.open.length > 0;
    return true;
  }

  function cardHtml(p) {
    var st = stats(p), s = status(st);
    var meta = C ? (pl(st.open.length, 'open comment', 'open comments') + (st.done.length ? ' · ' + st.done.length + ' resolved' : '')) : 'Comments are not showing right now';
    var said = '';
    if (C && st.any) {
      said = st.open.slice(0, 4).map(function (c) {
        var b = String(c.body || ''); if (b.length > 150) b = b.slice(0, 147) + '…';
        return '<a class="lpr-cm" href="' + esc(openUrl(p, c.id)) + '" target="_blank" rel="noopener"><small>' + esc(firstName(c.by)) + ' · ' + esc(fat(c.at)) + ' · pin ' + esc(c.num) + '</small>' + esc(b) + '</a>';
      }).join('');
      if (st.open.length > 4) said += '<p class="lpr-more">and ' + (st.open.length - 4) + ' more on the page.</p>';
      if (!st.open.length) said = '<p class="lpr-none">Every comment on this page is resolved.</p>';
    } else {
      said = '<p class="lpr-none">' + (C ? 'Nothing yet. Be the first.' : 'Open the page and tap + Add a comment.') + '</p>';
    }
    return '<article class="lpr-card">' +
      '<div class="lpr-thumb lpr-h-' + p.hue + '"><img src="' + esc(p.img) + '" alt="" loading="lazy" onerror="this.remove()"><i>' + esc(p.tag) + '</i></div>' +
      '<div class="lpr-body">' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="lpr-for">' + esc(p.who) + '</p>' +
        '<div class="lpr-mid"><span class="lpr-status lpr-s-' + s.k + '">' + esc(s.t) + '</span>' +
          '<div class="lpr-ghost"><span>' + esc(meta) + '</span>' + (p.earlier ? '<a href="' + esc(p.earlier) + '" target="_blank" rel="noopener">Earlier version</a>' : '') + '</div></div>' +
        '<a class="lpr-btn" href="' + esc(openUrl(p)) + '" target="_blank" rel="noopener">Open and comment</a>' +
        '<details><summary>What has been said' + (C ? ' (' + (st.open.length + st.done.length) + ')' : '') + '</summary>' + said + '</details>' +
      '</div></article>';
  }

  var ICON_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  var ICON_GRID = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>';

  function render() {
    var el = main(); if (!el) return;
    var shown = PAGES.filter(visible);
    var chips = [['all', 'All pages'], ['new', 'Not reviewed yet'], ['open', 'With open comments']].map(function (f) {
      return '<button type="button" class="lpr-chip" data-f="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + '</button>';
    }).join('');
    el.innerHTML = '<div class="lpr">' +
      '<h2>Landing Page Review</h2>' +
      '<p class="lpr-lead">The campaign landing pages, as clients will see them. All of them are still drafts. Open one, drop a comment on the exact spot you want changed, and Kate, Hanneh, and Coach Emma see it straight away.</p>' +
      '<div class="lpr-how"><div><b>1</b><span>Tap <strong>Open and comment</strong> on a page.</span></div><div><b>2</b><span>On the page, tap <strong>+ Add a comment</strong>.</span></div><div><b>3</b><span>Tap the spot, write what to change, post.</span></div></div>' +
      '<div class="lpr-bar"><div class="lpr-filters" role="group" aria-label="Show">' + chips + '</div>' +
        '<div class="lpr-seg" role="group" aria-label="Layout">' +
          '<button type="button" data-m="list" aria-pressed="' + (mode === 'list') + '" title="List layout (V)" aria-label="List layout">' + ICON_LIST + '</button>' +
          '<button type="button" data-m="grid" aria-pressed="' + (mode === 'grid') + '" title="Grid layout (V)" aria-label="Grid layout">' + ICON_GRID + '</button>' +
        '</div></div>' +
      (loadErr ? '<p class="lpr-warn">The comment counts could not be read just now, so they are not shown. The pages still open and you can still comment on them.</p>' : '') +
      '<div class="lpr-grid' + (mode === 'list' ? ' lpr-list' : '') + '">' + (shown.length ? shown.map(cardHtml).join('') : '<p class="slv-muted">No pages match that filter.</p>') + '</div>' +
      '<p class="lpr-note">Grid or list is remembered for you. Press V to switch, the same as Google Drive.</p>' +
      '</div>';
  }

  function setMode(m) { mode = m; saveMode(m); render(); }

  function bind() {
    var el = main(); if (!el || el.__lprBound) return;
    el.__lprBound = true;
    el.addEventListener('click', function (e) {
      var f = e.target.closest && e.target.closest('[data-f]');
      if (f) { filter = f.getAttribute('data-f'); render(); return; }
      var m = e.target.closest && e.target.closest('[data-m]');
      if (m) setMode(m.getAttribute('data-m'));
    });
    if (!keyBound) {
      keyBound = true;
      document.addEventListener('keydown', function (e) {
        if (!e.key || e.key.toLowerCase() !== 'v' || e.ctrlKey || e.metaKey || e.altKey) return;
        var mn = main(); if (!mn || mn.offsetParent === null) return;   // only while this page is the one on screen
        var t = e.target, tag = ((t && t.tagName) || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
        setMode(mode === 'list' ? 'grid' : 'list');
      });
    }
  }

  // Called by showView each time the page opens: read the pins now, then draw.
  window.renderLandingReview = async function () {
    var el = main(); if (!el) return;
    if (typeof TRS_LEVEL === 'undefined' || (TRS_LEVEL !== 3 && TRS_LEVEL !== 5)) { notFound(); return; }
    mode = savedMode(); filter = 'all'; loadErr = false;
    bind(); render();   // the pages show at once; the counts come a moment after
    try {
      var r = await sb.rpc('page_comments_get', { p_page: null });
      if (r.error) throw new Error(r.error.message);
      C = r.data && r.data.comments ? r.data : null;
      if (!C) loadErr = true;
    } catch (e) { console.error(e); C = null; loadErr = true; }
    if (main() && main().offsetParent !== null) render();
  };
})();
