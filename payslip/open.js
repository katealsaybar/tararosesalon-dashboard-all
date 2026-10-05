/* ============================================================
   TARA ROSE SALONS: open a payslip on our own address (Kate, 2 Oct 2026)
   payslip/open.js, used by the stylist page and the Upload Portal's Payslips tab.

   The payslips edge function hands back a 10-minute signed storage link. Opening it
   straight showed the Supabase project address to staff. Now the button opens
   /payslip/ (trk-salon-os.com), and that page fetches the PDF and shows it. The link
   travels by postMessage between the two windows of this site, never in an address,
   so neither the link nor anyone's key ends up in the history or a shared URL.

   When the new tab is blocked (the browser inside the Gmail or Outlook app on a phone),
   the page opens in this same tab instead: the link waits in sessionStorage, which
   /payslip/ reads once and clears (Kate, 5 Oct 2026, after Emma W couldn't open hers).

   openPayslipPage(getLink, onFail)
     getLink()  async, resolves { url, name } or null when there is no payslip
     onFail(e)  called with null (no payslip) or the error; the new tab is closed
   ============================================================ */
(function () {
  function sameTab(getLink, onFail) {
    Promise.resolve().then(getLink).then(function (l) {
      if (!l || !l.url) { onFail(null); return; }
      try { sessionStorage.setItem('trs-payslip', JSON.stringify({ url: l.url, name: l.name })); }
      catch (e) { onFail(e); return; }
      location.href = '/payslip/';
    }, onFail);
  }
  window.openPayslipPage = function (getLink, onFail) {
    // Opened on the click itself, before any await, or phones block it as a pop-up.
    var w = window.open('/payslip/', '_blank');
    if (!w) { sameTab(getLink, onFail); return; }
    var link = null, ready = false;
    function send() { if (link && ready) w.postMessage({ type: 'payslip', url: link.url, name: link.name }, location.origin); }
    // The page says "ready" on load (and again on a reload); each time it gets the link.
    window.addEventListener('message', function (e) {
      if (e.source !== w || e.origin !== location.origin || !e.data || e.data.type !== 'payslip-ready') return;
      ready = true; send();
    });
    Promise.resolve().then(getLink).then(function (l) {
      if (!l || !l.url) { w.close(); onFail(null); return; }
      link = l; send();
    }, function (e) { w.close(); onFail(e); });
  };
})();
