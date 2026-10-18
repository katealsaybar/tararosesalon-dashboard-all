/* Voice search, 18 Oct 2026 (Kate: "may voice rec button" on every search bar).
   TRSMic.add(input) puts a mic button right after a search input. It uses the browser's own speech recognition
   (Chrome, Edge, Safari), so there is no server, key or cost; where the browser cannot listen (Firefox) nothing is added.
   What is heard goes into the bar as it is said and fires the bar's own input event, so the suggestions or results
   draw as if it had been typed. Esc, or tapping the mic again, stops it. It never submits: Enter does that. */
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var css = document.createElement('style');
  css.textContent =
    '.trs-mic{appearance:none;cursor:pointer;flex-shrink:0;display:grid;place-items:center;width:30px;height:30px;padding:0;' +
    'border:0;border-radius:50%;background:none;color:var(--muted);transition:color .15s,background .15s}' +
    '.trs-mic svg{width:17px;height:17px;flex-shrink:0;color:inherit}' +
    '.trs-mic:hover{color:var(--text);background:var(--surface2)}' +
    '.trs-mic:focus-visible{outline:0;box-shadow:0 0 0 3px rgba(153,246,228,.6)}' +
    '.trs-mic.on{color:#C0392B;background:rgba(192,57,43,.12);animation:trsMic 1.2s ease-in-out infinite}' +
    '@keyframes trsMic{0%,100%{box-shadow:0 0 0 0 rgba(192,57,43,.35)}50%{box-shadow:0 0 0 7px rgba(192,57,43,0)}}' +
    '@media (pointer:coarse){.trs-mic{width:40px;height:40px;margin:-5px -6px -5px 0}.trs-mic svg{width:19px;height:19px}}' +
    '@media (prefers-reduced-motion:reduce){.trs-mic.on{animation:none}}';
  document.head.appendChild(css);
  var MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

  function add(inp) {
    if (!SR || !inp || inp.dataset.mic) return null;
    inp.dataset.mic = '1';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trs-mic';
    btn.title = 'Search by voice';
    btn.setAttribute('aria-label', 'Search by voice');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = MIC;
    inp.after(btn);
    var ph = inp.placeholder, rec = null, on = false;
    function off() { on = false; btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); inp.placeholder = ph; }
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the bar focused
    btn.addEventListener('click', function () {
      if (on && rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'en-GB';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onstart = function () {
        on = true; btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
        inp.value = ''; inp.placeholder = 'Listening…'; inp.focus();
      };
      rec.onresult = function (e) {
        var t = '';
        for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        inp.value = t.slice(0, 200);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.onerror = function (e) {
        off();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') inp.placeholder = 'Allow the microphone to search by voice';
        else if (e.error === 'no-speech') inp.placeholder = 'Did not catch that, tap the mic and try again';
        if (inp.placeholder !== ph) setTimeout(function () { if (!on) inp.placeholder = ph; }, 4000);
      };
      rec.onend = function () { var had = on; off(); if (had) inp.focus(); };
      try { rec.start(); } catch (err) { off(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && on && rec) rec.stop(); });
    return btn;
  }
  window.TRSMic = { add: add };
})();
