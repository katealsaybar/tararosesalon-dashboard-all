/* Wellness Voucher: the sign-in gate for the two pages that touch real client data.
 *
 * The rest of this pack is deliberately open. Reviewers stay anonymous, because making Tara
 * go to her inbox before typing a sentence meant she never typed one. These two pages are
 * the exception, and the reason is not the interface, it is the database behind it:
 *
 *   voucher-issue  allocates a real serial and writes a real row. A serial cannot be
 *                  corrected afterwards, so a stranger with the path can burn the sequence.
 *   voucher-log    lists client names. That is the one thing in the pack that is not ours
 *                  to leave on a public URL.
 *
 * noindex was doing this job before and could not: the repository is public, so the path is
 * in a browsable file listing whatever the meta tag says.
 *
 * THIS OVERLAY IS NOT THE CONTROL. It is the explanation. The control is that anon holds no
 * grant on voucher_issues, voucher_log or issue_voucher, so a console with the publishable
 * key gets nothing. See sql/voucher_lockdown.sql. Both exist because the database refusing a
 * request produces an error nobody at a till can read, and this produces a sentence.
 *
 * Plain script, no modules, like everything else here. Load AFTER auth/supabase-client.js.
 * Usage: TRSGate.require(why).then(startThePage), and nothing before it touches the
 * database. `why` is the one sentence that says what this particular page needs a name for,
 * because "issues real card numbers" is true of the till and not of the log, and a reason
 * that does not match the page in front of you is how a gate teaches people to click past it.
 */
(function () {
  var G = window.TRSGate = {};
  var TRS = window.TRS || null;
  var node = null;

  function panel(html) {
    if (!node) {
      node = document.createElement('div');
      node.id = 'trs-gate';
      node.setAttribute('style',
        'position:fixed;inset:0;z-index:9999;background:#FAF8F4;display:grid;' +
        'place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;');
      document.body.appendChild(node);
    }
    node.innerHTML =
      '<div style="max-width:460px;background:#fff;border:1px solid #E7E2D8;border-radius:14px;' +
      'padding:28px;text-align:center;color:#2D2E37;line-height:1.6">' + html + '</div>';
  }

  function lift() { if (node) { node.remove(); node = null; } }

  G.require = function (why) {
    return new Promise(function (resolve) {
      if (!TRS || !TRS.db) {
        panel('<div style="font-family:Georgia,serif;font-size:24px;margin-bottom:10px">' +
          'Cannot reach Supabase</div><p style="color:#6E6E77;font-size:14px">This page needs ' +
          'the database, for the serial and for the log. Check the connection and reload.</p>');
        return;                                  // deliberately never resolves
      }

      function check() {
        if (TRS.session) { lift(); resolve(TRS); return; }
        var email = '<a href="' + TRS.loginUrl() + '" style="display:inline-block;' +
          'margin-top:16px;background:#2D2E37;color:#fff;text-decoration:none;font-size:14px;' +
          'font-weight:600;padding:11px 20px;border-radius:8px">Sign in to continue</a>';
        panel('<div style="font-family:Georgia,serif;font-size:24px;margin-bottom:10px">' +
          'Sign in first</div>' +
          '<p style="color:#6E6E77;font-size:14px">' +
          (why || 'This page reaches real client records') +
          ', so it is one of the two parts of the pack that ask who you are. The salon ' +
          'account is enough, you do not need Kate\'s.</p>' + email);
      }

      // Re-checked on every auth change, so signing in in the other tab lifts this one, and
      // signing out on a shared salon machine puts it straight back.
      TRS.ready.then(check);
      TRS.onAuthChange(check);
    });
  };
})();
