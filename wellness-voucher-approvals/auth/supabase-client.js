// Wellness Voucher Approval Pack: shared Supabase client + role check.
//
// Same shape as the CWD knowledgebase (auth/supabase-client.js + auth-guard.js), reduced to
// what this pack needs. The difference from CWD: nothing here is gated behind a login.
// Reviewers stay anonymous and can still read and post, which was a deliberate call, because
// making Tara go to her inbox before typing a sentence meant she never typed one.
//
// What signing in changes is EDITING. Only Kate's account can resolve a note, archive a row,
// or decide a suggestion, so the others watch the progress instead of moving it. That is
// enforced in the database (see sql/supabase_roles_setup.sql and sql/notes_setup.sql); the UI
// hiding below is convenience, not the guard.
//
// Plain script, not a module: the pack has to work opened straight off disk as file://.
// Load AFTER the Supabase UMD script and BEFORE shared/notes-widget.js / dashboard/dashboard-app.js.
// EVERY page that runs one of those two needs this script, not just the sign-in page. Without
// it window.TRS never exists, canEdit() is permanently false, and the editor controls never
// appear no matter who is signed in. That was the state until 2026-08-08.

(function () {
  var SUPABASE_URL = 'https://vlqvefsaxztitcbhirxt.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JlOzwdcK0xjmE6j3nHmwhg_xDKxq1vv';

  // Which account is the editor, and what that person is called in the notes. The name has
  // to be one of REVIEWERS in shared/notes-widget.js / public.is_reviewer_name() in
  // sql/notes_setup.sql, because it is written into author_name and resolved_by_name.
  // Add a line here to hand someone else editing rights (they also need role='admin' in
  // public.profiles, which is the part that actually enforces it).
  var EDITOR_NAMES = {
    'kate@tararosesalon.com': 'Kate'
  };

  // Where the pack root sits relative to this page: '' at the root, '../' one folder down,
  // '../../' for website-mockups/<name>/. Read from body[data-auth-root]; the older
  // data-auth-depth="1" still works so nothing that already sets it breaks.
  var ROOT = (document.body && document.body.dataset.authRoot) ||
    (document.body && document.body.dataset.authDepth === '1' ? '../' : '');

  var TRS = window.TRS = window.TRS || {};
  TRS.SUPABASE_URL = SUPABASE_URL;
  TRS.resolveUrl = function (path) { return ROOT + path; };
  // Sign-in URL that comes back here afterwards. login.js only honours a relative path, and
  // it resolves it from auth/, so returnTo is '../' + this page's path relative to the pack
  // root: '../index.html', '../calendar/calendar.html',
  // '../website-mockups/terms/terms.html'.
  TRS.loginUrl = function () {
    var depth = ROOT.split('../').length - 1;          // 0, 1 or 2
    // Moved to trk-salon-os.com/wellness-voucher-approvals/ on 29 Sep 2026 with clean
    // slugs (voucher-log/, not voucher-log/voucher-log.html). A path ending in "/" is
    // served by its index.html, so count that file, or returnTo lands one folder too high.
    var path = window.location.pathname;
    if (path.charAt(path.length - 1) === '/') path += 'index.html';
    var segments = path.split('/').filter(Boolean);
    var relative = segments.slice(segments.length - (depth + 1)).join('/') || 'index.html';
    return TRS.resolveUrl('auth/index.html') + '?returnTo=' + encodeURIComponent('../' + relative);
  };

  if (typeof supabase === 'undefined') {
    // SDK blocked or offline. Fail into anonymous read-only rather than a dead page.
    TRS.db = null; TRS.session = null; TRS.profile = null;
    TRS.isAdmin = function () { return false; };
    TRS.email = function () { return null; };
    TRS.displayName = function () { return ''; };
    TRS.onAuthChange = function () {};
    TRS.signOut = function () { return Promise.resolve(); };
    TRS.ready = Promise.resolve(TRS);
    return;
  }

  // Session in localStorage, not sessionStorage. It was sessionStorage first, to keep an
  // editor session from outliving the tab on a shared salon machine. That could not work:
  // every link out of index.html is target="_blank" rel="noopener", and a noopener tab does
  // not inherit sessionStorage, so signing in bought you edit rights on the one page you
  // signed in from and nowhere else. The shared-machine risk is handled instead by keeping
  // "Signed in as … · Sign out" visible on every page.
  TRS.db = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: window.localStorage,
      storageKey: 'trs-approval-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  TRS.session = null;
  TRS.profile = null;
  TRS.isAdmin = function () { return !!(TRS.profile && TRS.profile.role === 'admin'); };
  TRS.email = function () { return TRS.session && TRS.session.user ? TRS.session.user.email : null; };

  // The name the notes are filed under while signed in. Empty when signed out, which is
  // what puts the four-name toggle back.
  TRS.displayName = function () {
    var email = TRS.email();
    if (!email) return '';
    return EDITOR_NAMES[email.toLowerCase()] || '';
  };

  var listeners = [];
  TRS.onAuthChange = function (fn) { listeners.push(fn); };
  function announce() { listeners.forEach(function (fn) { try { fn(TRS); } catch (e) {} }); }

  // The role comes from public.profiles, never from anything the browser could set. A read
  // failure means "not admin": the database would refuse the write anyway.
  function loadProfile() {
    if (!TRS.session) { TRS.profile = null; return Promise.resolve(); }
    return TRS.db.from('profiles').select('id,email,role')
      .eq('id', TRS.session.user.id).maybeSingle()
      .then(function (res) { TRS.profile = res.error ? null : res.data; })
      .catch(function () { TRS.profile = null; });
  }

  TRS.ready = TRS.db.auth.getSession()
    .then(function (res) { TRS.session = res.data ? res.data.session : null; return loadProfile(); })
    .catch(function () { TRS.session = null; TRS.profile = null; })
    .then(function () { announce(); return TRS; });

  TRS.db.auth.onAuthStateChange(function (_event, session) {
    TRS.session = session || null;
    loadProfile().then(announce);
  });

  TRS.signOut = function () {
    return TRS.db.auth.signOut().then(function () {
      TRS.session = null; TRS.profile = null; announce();
    });
  };
})();
