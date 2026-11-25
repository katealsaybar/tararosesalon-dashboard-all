/* "THIS PAGE WAS UPDATED, REFRESH" ON A STANDALONE TEAM HOME PAGE (Kate, 20 Nov 2026: "ALWAYS").
   The card (js/page-refresh.js) used to live in the dashboard shell only, so a Team Home page that someone had open on its own, like /targets/, never offered it
   after a push. This puts the same card, the same wording and the same version check on those pages.

   A page opts in by being named in PATHS below (or by setting window.TRS_VER_PAGE before this file loads): the value is its id in js/pages.js, which is also the key
   in page-versions.json and js/page-dates.js. Its version moves when scripts/stamp-page-dates.py sees that page's own files change (OWN in that script).
   Not shown in the dashboard's frame (?embed=1 or any frame): the dashboard shell shows its own card there, and two would stack. */
(function () {
  'use strict';
  try { if (window.top !== window.self || /[?&]embed=1\b/.test(location.search)) return; } catch (e) { return; }
  var PATHS = { '/targets': 'targetcalc', '/hub/find-stylist': 'findstylist' };
  var path = location.pathname.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '');
  var id = window.TRS_VER_PAGE || PATHS[path];
  if (!id) return;

  var css = document.createElement('style');
  css.textContent =
    '.upd{position:fixed;z-index:150;right:18px;width:min(340px,calc(100vw - 24px));background:var(--surface,#fff);border:1px solid var(--border,#E8E2D6);border-left:3px solid var(--warn,#8A5A0C);' +
    'border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:14px 16px;font-size:13px;color:var(--text,#1A1A1A);animation:upd-in 260ms ease both}' +
    '.upd.ver{bottom:calc(18px + env(safe-area-inset-bottom,0px))}' +
    '@media(min-width:900px){.upd{right:40px}}@media(max-width:520px){.upd{right:12px}.upd.ver{bottom:calc(12px + env(safe-area-inset-bottom,0px))}}' +
    '@keyframes upd-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
    '.upd[hidden]{display:none}' +
    '.upd-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--warn,#8A5A0C);font-weight:700}' +
    '.upd-lead{margin:7px 0 0;line-height:1.45}' +
    '.upd-foot{margin:11px 0 0;font-size:11.5px;line-height:1.45;color:var(--muted2,#77706A)}' +
    '.upd-acts{display:flex;gap:8px;margin-top:13px}' +
    '.upd-btn{border:1px solid var(--text,#1A1A1A);background:var(--accent,#1A1A1A);color:var(--accent-fg,#FBF7F0);border-radius:20px;padding:9px 14px;font:inherit;font-size:12px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;white-space:nowrap}' +
    '.upd-btn.ghost{background:var(--surface,#fff);color:var(--muted,#565049);border-color:var(--border,#E8E2D6)}' +
    '.upd-btn[disabled]{opacity:.55;cursor:default}' +
    '.upd-pill{display:none;border:1px solid var(--warn,#8A5A0C);background:var(--surface,#fff);color:var(--warn,#8A5A0C);border-radius:20px;padding:9px 13px;font:inherit;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;white-space:nowrap;box-shadow:0 8px 28px rgba(0,0,0,.18)}' +
    '.upd.mini{width:auto;padding:0;border:0;box-shadow:none;background:none}.upd.mini .upd-full{display:none}.upd.mini .upd-pill{display:block}';
  document.head.appendChild(css);

  var box = document.createElement('div');
  box.className = 'upd ver'; box.id = 'verNotice'; box.hidden = true; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
  box.innerHTML = '<button class="upd-pill" id="verPill" type="button">Page updated. Refresh</button><div class="upd-full" id="verFull"></div>';
  box.querySelector('#verPill').onclick = function () { box.classList.remove('mini'); };
  document.body.appendChild(box);

  var label = (window.TRS_VER_LABEL || document.title.split(' · ')[0] || 'This page');
  if (typeof window.trsPageLabel !== 'function') window.trsPageLabel = function () { return label; };

  function load(src) { return new Promise(function (ok) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ok; document.head.appendChild(s); }); }
  // page-dates.js says which version of this page this tab was loaded with; page-refresh.js then compares it with page-versions.json.
  load('/js/page-dates.js?v=a6f3de07').then(function () { return load('/js/page-refresh.js?v=449920b0'); }).then(function () {
    if (typeof window.trsVerCheck === 'function') window.trsVerCheck(id);
  });
})();
