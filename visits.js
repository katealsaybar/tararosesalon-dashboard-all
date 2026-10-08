/* VISITS (Kate, 8 Oct 2026): what a person opens most, for the shortcuts on /search/.
   Kept in this browser only (localStorage trs-visits), never sent anywhere. A visit is a
   Team Home page opened, or a dashboard page shown; the doors themselves (/search/, the
   Team Home front page) are not destinations, so they are not counted. */
(function () {
  var KEY = 'trs-visits', MAX = 40, last = {};
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function bump(k, title, href) {
    if (!k || !title) return;
    var now = Date.now();
    if (last[k] && now - last[k] < 20000) return;          // a reload or a double tap is not two visits
    last[k] = now;
    var o = read(), e = o[k] || { n: 0 };
    e.n++; e.t = title; e.h = href; e.ts = now; o[k] = e;
    var keys = Object.keys(o);
    if (keys.length > MAX) {
      keys.sort(function (a, b) { return o[a].n - o[b].n || o[a].ts - o[b].ts; })
        .slice(0, keys.length - MAX).forEach(function (x) { delete o[x]; });
    }
    write(o);
  }
  var p = location.pathname.replace(/\.html$/, ''), q = new URLSearchParams(location.search);

  // Team Home: a page or section (kb?p= or kb?s=), or one of its own tools.
  if (p.indexOf('/hub/') === 0 && !/^\/hub\/?(index)?$/.test(p)) {
    var arg = q.get('p') ? '?p=' + encodeURIComponent(q.get('p')) : q.get('s') ? '?s=' + encodeURIComponent(q.get('s')) : '';
    window.addEventListener('load', function () {
      var title = (document.title || '').replace(/\s*[·|]\s*Tara Rose.*$/i, '').trim();
      if (title && !/^Team Home$/i.test(title)) bump('h:' + p + arg, title, p + arg);
    });
  }

  // The dashboard: each page shown through showView, named as the sidebar names it.
  if (p === '/' || p === '/index') {
    var hook = function () {
      var o = window.showView;
      if (typeof o !== 'function' || o.__visits) return false;
      var w = function (v) {
        try {
          var el = document.querySelector('#sidebar .nav-sub[onclick*="\'' + v + '\'"]');
          var t = el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
          if (t) bump('d:' + v, t, '/?view=' + v);
        } catch (e) { /* counting never breaks navigation */ }
        return o.apply(this, arguments);
      };
      w.__visits = true;
      window.showView = w;
      return true;
    };
    if (!hook()) window.addEventListener('load', hook);
  }
})();
