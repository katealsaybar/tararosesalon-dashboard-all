/* Kate, 3 Nov 2026: Hide Pages & Under Construction. The labels half of it (pages.js holds the rule: TRS_STATUS, trsPageStatus, and a hidden page
   opening for Level 5 only). Two things are drawn here:
     - a small tag after the page's name in the sidebar: "Under construction" for everyone who can open it, "Hidden" for Kate, who is the only one
       who still sees a hidden page, so she can tell it is switched off for everyone else;
     - a notice at the top of the page itself, with the optional note typed on the Hide Pages & Under Construction page.
   Called from index.html: trsStatusNav() once after the sign-in has loaded the status, trsStatusBanner(view) from showView. */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var WORD = { construction: 'Under construction', hidden: 'Hidden' };

  window.trsStatusNav = function () {
    Array.prototype.forEach.call(document.querySelectorAll('#sidebar .nav-flag'), function (n) { n.parentNode.removeChild(n); });
    if (!window.TRS_PAGES || typeof trsPageStatus !== 'function') return;
    TRS_PAGES.forEach(function (p) {
      var st = trsPageStatus(p.id);
      if (!st || p.retired) return;
      var nav = document.querySelector('#sidebar .nav-sub[onclick*="showView(\'' + p.id + '\'"]');
      if (!nav) return;
      var tag = document.createElement('span');
      tag.className = 'nav-flag nav-flag-' + st;
      tag.textContent = WORD[st];
      nav.appendChild(tag);
    });
  };

  // The notice sits just before the page's own block, not inside it, so a page that redraws itself does not wipe it.
  window.trsStatusBanner = function (view) {
    Array.prototype.forEach.call(document.querySelectorAll('.pg-status'), function (n) { n.parentNode.removeChild(n); });
    if (typeof trsPageStatus !== 'function') return;
    var st = trsPageStatus(view), target = document.getElementById('view-' + view);
    if (!st || !target || !target.parentNode) return;
    var info = (window.TRS_STATUS || {})[trsLive(view)] || {};
    var box = document.createElement('div');
    box.className = 'pg-status pg-status-' + st;
    box.setAttribute('role', 'note');
    box.innerHTML = st === 'hidden'
      ? '<b>Hidden.</b> Only you can see this page. Everyone else has it removed from the menu, Team Home and search.'
      : '<b>Under construction.</b> This page is still being built, so the numbers or layout may change.' + (info.note ? ' ' + esc(info.note) : '');
    target.parentNode.insertBefore(box, target);
  };
})();
