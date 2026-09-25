/* ============================================================
   TARA ROSE LADIES SALON — Dashboard sign-in helpers
   auth.js (Kate, 25 Sep 2026)

   Supabase Auth: Google, or email + password, with forgot-password.
   Who gets in is public.dashboard_users (migrations/dashboard_sign_in_phase_a.sql):
   signing in works for anyone, but dashboard_role() only answers for an email on
   that list, and the table policies only let those people read or write.

   The session sits in localStorage under sb-<project>-auth-token, so every page on
   trk-salon-os.com (the dashboard, the Upload Portal, the Google Reviews frame)
   shares one sign-in. Needs supabase-js loaded first.
   ============================================================ */
(function () {
  var URL = 'https://gvijxenafoowajqktqvd.supabase.co';
  var KEY = 'sb_publishable_e5o0vPayb-6552oARTeu7Q_KoqfT7xO';
  var STORE = 'sb-gvijxenafoowajqktqvd-auth-token';

  // dashboard.js's `sb` when it's on the page, so .from()/.rpc() carry the session.
  function client() {
    if (typeof sb !== 'undefined' && sb && sb.auth) return sb;
    if (!window.__trsSb) window.__trsSb = supabase.createClient(URL, KEY);
    return window.__trsSb;
  }

  // For raw fetch() calls. Read straight from storage so it also works in frames
  // that don't load supabase-js; the page that does keeps the token refreshed.
  function token() {
    try { var s = JSON.parse(localStorage.getItem(STORE)); return (s && s.access_token) || null; }
    catch (e) { return null; }
  }
  function headers(extra) {
    var h = { apikey: KEY, Authorization: 'Bearer ' + (token() || KEY) };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  async function role() {
    var r = await client().rpc('dashboard_role');
    return r.error ? null : r.data;
  }

  // { name, role } from dashboard_users, for the header greeting.
  async function me() {
    var r = await client().rpc('dashboard_me');
    return (!r.error && r.data && r.data[0]) || null;
  }

  // Pages other than the dashboard: no session, or not on the list, goes to the
  // dashboard's sign-in and comes back here afterwards.
  async function guard(root) {
    var r = (await client().auth.getSession()).data.session ? await role() : null;
    if (r) return r;
    location.replace((root || '../') + '?next=' + encodeURIComponent(location.pathname + location.search));
    return new Promise(function () {});
  }

  window.TRSAuth = { URL: URL, KEY: KEY, client: client, token: token, headers: headers, role: role, me: me, guard: guard };
})();
