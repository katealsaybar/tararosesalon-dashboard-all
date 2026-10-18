/* MY NUMBERS SIGN-IN (audit 18 Oct 2026, P7-01 and P3-06).
   A stylist's page opens from her own link (performance/?t=<token>, or trk-salon-os.com/me/<name>). The link alone is the key, so a forwarded
   link opens her numbers and her payslip for anyone. The lock (kb_settings my_numbers_lock, switched on by Kate from Staff Roster and Access)
   makes the database answer only for a signed-in person whose email is hers; a leader or the owner (dashboard Level 3 and above) opens anyone's.
   While the switch is OFF nothing here changes what anybody sees: with no session every call is the anon call it always was.

   This file does three things and nothing else:
     headers()        the headers for a call, carrying the signed-in person's session when there is one (refreshed here, because this page does
                      not load supabase-js; the dashboard's sign-in keeps the same session in localStorage), the anon key otherwise
     isSignIn(err)    true when the database said "sign_in_required"
     card(app)        what to show then: a sign-in card that sends her to the site's sign-in and brings her back to this same link
   Loaded before one2one.js, performance.js and year-levels.js. */
(function () {
  var BASE = 'https://gvijxenafoowajqktqvd.supabase.co';
  var KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';
  var STORE = 'sb-gvijxenafoowajqktqvd-auth-token';
  var inflight = null;

  function stored() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }

  // The access token, refreshed when it is about to lapse (one hour). Null when nobody is signed in on this browser.
  async function jwt() {
    var s = stored();
    if (!s || !s.access_token) return null;
    var exp = (s.expires_at || 0) * 1000;
    if (!exp || exp - Date.now() > 60000) return s.access_token;
    if (!s.refresh_token) return exp > Date.now() ? s.access_token : null;
    if (!inflight) {
      inflight = (async function () {
        try {
          var r = await fetch(BASE + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
          if (!r.ok) return exp > Date.now() ? s.access_token : null;   // a lapsed token is worse than none: the anon call still works with the lock off
          var n = await r.json();
          try { localStorage.setItem(STORE, JSON.stringify(Object.assign({}, s, n))); } catch (e) { /* the call still goes with the new token */ }
          return n.access_token || s.access_token;
        } catch (e) { return exp > Date.now() ? s.access_token : null; }
        finally { setTimeout(function () { inflight = null; }, 0); }
      })();
    }
    return inflight;
  }

  async function headers(extra) {
    var h = { apikey: KEY, Authorization: 'Bearer ' + ((await jwt()) || KEY), 'Content-Type': 'application/json' };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  function isSignIn(err) { return /sign_in_required/.test(String((err && err.message) || err || '')); }

  // The email she is signed in with on this browser, read from the token, for "you are signed in as ...".
  function who() {
    try {
      var s = stored(); if (!s || !s.access_token) return '';
      var p = JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.email || '';
    } catch (e) { return ''; }
  }

  function back() { return '/index.html?next=' + encodeURIComponent(location.pathname + location.search); }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function card(app) {
    var me = who();
    app.innerHTML =
      '<div style="max-width:420px;margin:48px auto;padding:0 20px;text-align:center">' +
      '<h2 style="font-family:\'Playfair Display\',serif;font-weight:500;margin:0 0 10px">Sign in to see your numbers</h2>' +
      (me
        ? '<p class="muted" style="margin:0 0 18px">You are signed in as <b>' + esc(me) + '</b>, which is not the email this link was sent to. Sign in with the email your payslip comes to.</p>'
        : '<p class="muted" style="margin:0 0 18px">Your numbers and payslip are private. Sign in once with the email this link was sent to: Google, or an email link. This browser will remember you.</p>') +
      '<p style="margin:0"><a class="btn" id="paSign" href="' + back() + '" style="display:inline-block;padding:12px 22px;min-height:44px;box-sizing:border-box;text-decoration:none">' +
      (me ? 'Sign in with a different email' : 'Sign in') + '</a></p></div>';
    var b = document.getElementById('paSign');
    if (b && me) b.addEventListener('click', function () { try { localStorage.removeItem(STORE); } catch (e) { /* the sign-in page asks again anyway */ } });
  }

  window.PerfAuth = { jwt: jwt, headers: headers, isSignIn: isSignIn, card: card, who: who };
})();
