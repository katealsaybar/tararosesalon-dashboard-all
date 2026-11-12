// Who is on the site now (Kate, 29 Oct 2026, complaint triage batch 2). Two things, both light:
//   1. a Supabase Realtime Presence channel ('site-presence'): every signed-in page joins it with the person's email, so the people pickers can show
//      a green dot for "on the site now" without writing to the database;
//   2. site_ping(), at most every 5 minutes while the tab is open and showing (and the database ignores anything sooner than 2 minutes), which keeps
//      one row per person with the time of the last visit, for "last on the site 3 h ago".
// It only informs. It never decides who gets a complaint. Loaded by the dashboard (index.html) and by every Team Home page (hub.js).
(function () {
  if (window.TrsPresence) return;
  var P = window.TrsPresence = { online: {}, listeners: [], onChange: function (fn) { P.listeners.push(fn); } };
  function notify() { P.listeners.forEach(function (fn) { try { fn(); } catch (e) { /* a listener must not stop the others */ } }); }
  function client() {
    try { if (window.KB && window.KB.client && window.KB.client.channel) return window.KB.client; } catch (e) {}
    try { if (window.__trsSb && window.__trsSb.channel) return window.__trsSb; } catch (e) {}
    try { if (typeof sb !== 'undefined' && sb && sb.channel) return sb; } catch (e) {}
    return null;
  }
  var started = false, lastPing = 0;
  async function start() {
    if (started) return true;
    var c = client();
    if (!c) return false;
    var s = null;
    try { s = (await c.auth.getSession()).data.session; } catch (e) { return false; }
    if (!s || !s.user || !s.user.email) return false;
    started = true;
    var me = String(s.user.email).toLowerCase();
    try {
      var ch = c.channel('site-presence', { config: { presence: { key: me } } });
      ch.on('presence', { event: 'sync' }, function () {
        var st = ch.presenceState(), o = {};
        Object.keys(st).forEach(function (k) { o[String(k).toLowerCase()] = true; });
        P.online = o;
        notify();
      });
      ch.subscribe(function (status) { if (status === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
    } catch (e) { /* the dots then fall back to the last visit time */ }
    var ping = function () {
      if (document.visibilityState === 'hidden' || Date.now() - lastPing < 5 * 60 * 1000) return;
      lastPing = Date.now();
      try { c.rpc('site_ping'); } catch (e) { /* nothing to do */ }
    };
    ping();
    setInterval(ping, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', ping);
    return true;
  }
  // the sign-in can come after the page loads, so look a few times, then stop
  var tries = 0;
  (function again() { start().then(function (ok) { if (!ok && ++tries < 30) setTimeout(again, 2000); }); })();
})();
