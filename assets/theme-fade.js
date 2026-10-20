/* Smooth light and dark (Kate, 18 Oct 2026: "make light/dark mode transition really smooth").
   trsThemeSwap(change) runs `change` (the code that flips data-theme and repaints) inside a cross-fade of the whole page,
   about 0.6s, eased. Browsers with the View Transitions API do it as a true cross-fade of the old and the new page, which also
   covers anything redrawn by script (charts, the Pulse); the rest fade every colour, border and shadow by CSS for the same
   length. Nothing animates for someone who asked their system for reduced motion. Loaded before the page's own toggle. */
(function () {
  if (window.trsThemeSwap) return;
  var st = document.createElement('style');
  st.textContent =
    '::view-transition-old(root),::view-transition-new(root){animation-duration:.6s;animation-timing-function:cubic-bezier(.4,0,.2,1)}' +
    // during a true cross-fade the page's own short hover transitions (150-200ms on buttons, bars, pills) would run inside the new picture
    // and land at a different moment from the fade, so colours step instead of blending: they are switched off for the swap
    'html.theme-vt *,html.theme-vt *::before,html.theme-vt *::after{transition:none!important}' +
    'html.theme-fade,html.theme-fade *,html.theme-fade *::before,html.theme-fade *::after{transition:background-color .55s ease,color .55s ease,border-color .55s ease,fill .55s ease,stroke .55s ease,box-shadow .55s ease,outline-color .55s ease!important}';
  (document.head || document.documentElement).appendChild(st);
  window.trsThemeSwap = function (change) {
    var reduce = false;
    try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (reduce) { change(); return; }
    if (document.startViewTransition) {
      try {
        document.documentElement.classList.add('theme-vt');
        var vt = document.startViewTransition(function () {
          change();
          // two frames, so anything the change redraws is in place before the new picture is taken
          return new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(res); }); });
        });
        var done = function () { document.documentElement.classList.remove('theme-vt'); };
        if (vt && vt.finished) vt.finished.then(done, done); else done();
        return;
      } catch (e) { document.documentElement.classList.remove('theme-vt'); /* the CSS fade below */ }
    }
    var el = document.documentElement;
    el.classList.add('theme-fade');
    change();
    setTimeout(function () { el.classList.remove('theme-fade'); }, 700);
  };
})();
