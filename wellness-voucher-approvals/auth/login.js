// Wellness Voucher Approval Pack: sign-in.
//
// Email + password against Supabase Auth. No sign-up here on purpose: accounts are created
// in the Supabase dashboard, so nobody can grant themselves an account by visiting a public
// URL. Roles come from public.profiles and only Kate's is 'admin'.
//
// Plain script. Loaded after supabase-client.js, which owns the client and the session.

(function () {
  var TRS = window.TRS || {};
  var form = document.getElementById('form');
  var emailEl = document.getElementById('email');
  var pwEl = document.getElementById('pw');
  var btn = document.getElementById('submit');
  var msg = document.getElementById('msg');
  var who = document.getElementById('who');
  var toggle = document.getElementById('pwtoggle');

  function say(text, kind) {
    msg.textContent = text;
    msg.className = 'msg show ' + (kind || 'ok');
  }
  function clearSay() { msg.className = 'msg'; msg.textContent = ''; }

  toggle.addEventListener('click', function () {
    var showing = pwEl.type === 'text';
    pwEl.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? 'Show' : 'Hide';
    toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  // returnTo lets a page bounce someone here and get them back afterwards. Only same-origin
  // relative paths are honoured, because an absolute URL in a query string is an open-redirect.
  function returnTo() {
    var raw = new URLSearchParams(window.location.search).get('returnTo');
    if (!raw) return '../index.html';
    if (/^(https?:)?\/\//i.test(raw) || raw.indexOf(':') !== -1) return '../index.html';
    return raw;
  }

  function renderSignedIn() {
    var email = TRS.email();
    if (!email) { who.textContent = ''; return; }
    var role = TRS.isAdmin() ? 'editor' : 'viewer';
    who.innerHTML = 'Signed in as <strong>' + email + '</strong> (' + role + '). ' +
      '<a href="' + returnTo() + '">Back to the pack</a> · ' +
      '<a href="#" id="signout">Sign out</a>';
    var so = document.getElementById('signout');
    if (so) so.addEventListener('click', function (e) {
      e.preventDefault();
      TRS.signOut().then(function () { who.textContent = ''; clearSay(); form.reset(); });
    });
  }

  if (!TRS.db) {
    say('Cannot reach Supabase from this page. Check the connection and reload.', 'err');
    btn.disabled = true;
    return;
  }

  TRS.ready.then(function () {
    if (TRS.session) {
      say(TRS.isAdmin()
        ? 'You are signed in as the editor.'
        : 'You are signed in, but this account is a viewer, so it cannot action notes.', 'ok');
      renderSignedIn();
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = emailEl.value.trim();
    var pw = pwEl.value;
    if (!email || !pw) { say('Enter your email and password.', 'err'); return; }

    btn.disabled = true;
    btn.textContent = 'Signing in…';
    clearSay();

    TRS.db.auth.signInWithPassword({ email: email, password: pw }).then(function (res) {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      if (res.error) {
        // Supabase says "Invalid login credentials" for both a wrong password and an email
        // with no account. Deliberately not distinguished here either, because telling a stranger
        // which emails exist is a gift to whoever is guessing.
        say(res.error.message || 'That did not work. Check the email and password.', 'err');
        return;
      }
      pwEl.value = '';
      // the profile read happens in supabase-client.js on the auth state change
      return TRS.ready.then(function () {
        window.setTimeout(function () {
          say('Signed in. Taking you back to the pack…', 'ok');
          renderSignedIn();
          window.location.replace(returnTo());
        }, 250);
      });
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      say('Something went wrong reaching Supabase. Try again.', 'err');
    });
  });
})();
