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

  // The recogniser is a general one, so it hears our own words as the nearest everyday ones ("sarah rose kid" for
  // "Tara Rose Kidd", Kate, 18 Oct 2026). Two cheap helps: of the alternatives it offers for each phrase, take the one
  // that holds the most of OUR words; then put the usual slips right. Add to KNOWN and FIXES as new ones turn up.
  var KNOWN = ['tara rose', 'kidd', 'kate alsaybar', 'alsaybar', 'saadiyat', 'mamsha', 'khalifa city', 'motor city', 'al quoz', 'marasy', 'fratelli',
    'phorest', 'rebooking', 'wellness voucher', 'hair rhythm', 'podium race', 'my numbers', 'team home', 'induction'];
  var FIXES = [
    [/\b(?:sarah|sara|tarah|tera|terra|tarra|tyra|tiara|tara's) rose\b/gi, 'Tara Rose'],
    [/\brose (?:kid|kids|kit|kidd?s)\b/gi, 'Rose Kidd'],
    [/\b(?:saadiya|saadiyah|saadyat|sadiyat|sa'?adiat|saadiat)\b/gi, 'Saadiyat'],
    [/\b(?:khalifah?|kalifa|khalifa's) city\b/gi, 'Khalifa City'],
    [/\b(?:al|el) (?:quoz|kuz|koos|kwaz|quaz|couz)\b/gi, 'Al Quoz'],
    [/\bmoto city\b/gi, 'Motor City'],
    [/\b(?:faith|kate|kay|cate|kait|kaite|kit) (?:alzheimers?|al ?zheimers?|also ?bar|alsa ?bar|al ?sa ?bar|al ?sy ?bar|al ?say ?bar|al ?sai ?bar|al-?saybar|al ?sabbar|al ?seibar)\b/gi, 'Kate Alsaybar'],
    [/\bre[- ]?booking\b/gi, 'rebooking']
  ];
  function pick(result) {
    var best = result[0], top = -1;
    for (var i = 0; i < result.length; i++) {
      var t = result[i].transcript.toLowerCase(), n = 0;
      for (var k = 0; k < KNOWN.length; k++) if (t.indexOf(KNOWN[k]) >= 0) n++;
      if (n > top) { top = n; best = result[i]; }
    }
    return best.transcript;
  }
  function tidy(t) {
    for (var i = 0; i < FIXES.length; i++) t = t.replace(FIXES[i][0], FIXES[i][1]);
    return t;
  }

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
    // One tap listens through the pauses: it stops after SILENCE ms with nothing new said (or a second tap, or Esc),
    // not at the first breath. If the browser ends the session on its own sooner, it is started again and what was
    // already said is kept (Kate, 18 Oct 2026: "konting pause lang eh nawawala na agad", "napuputol").
    var SILENCE = 3500, restarts = 0, base = '', quiet = 0, wantOn = false;
    function begin() {
      rec = new SR();
      rec.lang = 'en-GB';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 5;
      rec.onstart = function () {
        on = true; btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
        if (!base) inp.value = '';
        inp.placeholder = 'Listening…'; inp.focus();
        clearTimeout(quiet); quiet = setTimeout(function () { wantOn = false; if (rec) rec.stop(); }, SILENCE + 3000);
      };
      rec.onresult = function (e) {
        var t = '';
        for (var i = 0; i < e.results.length; i++) t += pick(e.results[i]);
        inp.value = tidy(base + t).slice(0, 200);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        clearTimeout(quiet); quiet = setTimeout(function () { wantOn = false; if (rec) rec.stop(); }, SILENCE);
      };
      rec.onerror = function (e) {
        if (e.error === 'no-speech' && base) return;            // nothing more to say; onend finishes it
        if (e.error === 'aborted') return;
        wantOn = false; clearTimeout(quiet); off();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') inp.placeholder = 'Allow the microphone to search by voice';
        else if (e.error === 'no-speech') inp.placeholder = 'Did not catch that, tap the mic and try again';
        if (inp.placeholder !== ph) setTimeout(function () { if (!on) inp.placeholder = ph; }, 4000);
      };
      rec.onend = function () {
        if (wantOn && restarts < 4) {                           // cut short by the browser, not by us: carry on
          restarts++; base = inp.value ? inp.value.replace(/\s*$/, ' ') : '';
          try { begin(); return; } catch (err) { /* fall through and finish */ }
        }
        clearTimeout(quiet); var had = on; wantOn = false; off(); if (had) inp.focus();
      };
      rec.start();
    }
    btn.addEventListener('click', function () {
      if (on && rec) { wantOn = false; clearTimeout(quiet); rec.stop(); return; }
      restarts = 0; base = ''; wantOn = true;
      try { begin(); } catch (err) { wantOn = false; off(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && on && rec) { wantOn = false; clearTimeout(quiet); rec.stop(); } });
    return btn;
  }
  window.TRSMic = { add: add };
})();
