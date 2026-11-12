/* Complaint photo viewer (Kate, 9 Nov 2026).
   The files of one complaint open in a pop-up, oldest first, one after the other: arrows, the keyboard (left, right, Esc) or a swipe on the phone move
   through them. "Open in new window" is the second choice, and Ctrl/Cmd/middle-click on a thumbnail still opens the file in its own tab.
   Used by hub/complaint.html. window.CmpGallery.mount(box, items): box holds the thumbnail links (a.tk-file[data-i]), items is
   [{u: signed url, name, mime, by, at}] already sorted oldest first. */
(function () {
  if (window.CmpGallery) return;
  var css = '' +
    '.lb{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;background:rgba(14,14,18,.93);color:#fff;font-family:inherit}' +
    '.lb[hidden]{display:none}' +
    '.lb-top{display:flex;align-items:center;gap:10px;padding:12px 16px;flex:none}' +
    '.lb-cap{flex:1;min-width:0;line-height:1.3}' +
    '.lb-cap b{display:block;font-size:15px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
    '.lb-cap span{display:block;font-size:13px;opacity:.75;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
    '.lb-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:12px;border:1.5px solid rgba(255,255,255,.35);background:transparent;color:#fff;font:inherit;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer;white-space:nowrap}' +
    '.lb-btn:hover{background:rgba(255,255,255,.12)}' +
    '.lb-btn.pri{background:#fff;border-color:#fff;color:#1b1b20}' +
    '.lb-body{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 64px 12px;touch-action:pan-y}' +
    '.lb-stage{width:100%;height:100%;display:flex;align-items:center;justify-content:center;min-height:0}' +
    '.lb-stage img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;display:block;user-select:none;-webkit-user-drag:none}' +
    '.lb-card{max-width:420px;text-align:center;display:grid;gap:14px;justify-items:center}' +
    '.lb-card .big{font-size:28px;font-weight:600;letter-spacing:.04em}' +
    '.lb-card p{margin:0;opacity:.8;font-size:14px;overflow-wrap:anywhere}' +
    '.lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:1.5px solid rgba(255,255,255,.4);background:rgba(20,20,26,.7);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}' +
    '.lb-nav:hover{background:rgba(255,255,255,.18)}' +
    '.lb-nav:disabled{opacity:.25;cursor:default}' +
    '.lb-nav.prev{left:8px}.lb-nav.next{right:8px}' +
    '.lb-nav svg{width:22px;height:22px}' +
    '@media (max-width:640px){.lb-body{padding:0 8px 12px}.lb-nav{top:auto;bottom:16px;transform:none;background:rgba(20,20,26,.85)}.lb-nav.prev{left:16px}.lb-nav.next{right:16px}.lb-top{flex-wrap:wrap}.lb-cap{flex-basis:100%;order:3}.lb-btn{flex:1}.lb-stage{padding-bottom:64px;box-sizing:border-box}}' +
    '.tk-file .tk-no{position:absolute;top:4px;left:4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:600;line-height:20px;text-align:center;box-sizing:border-box}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function when(ts) { try { return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' }); } catch (e) { return ''; } }
  function isPic(f) { var m = f.mime || ''; return /^image\//.test(m) && !/heic/i.test(m); }
  var chev = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };

  var items = [], idx = 0, el = null, back = null, sx = 0, sy = 0;

  function build() {
    el = document.createElement('div');
    el.className = 'lb'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Photos and files');
    el.innerHTML = '<div class="lb-top"><div class="lb-cap"><b id="lbN"></b><span id="lbM"></span></div>' +
      '<a class="lb-btn" id="lbNew" target="_blank" rel="noopener">Open in new window</a>' +
      '<button type="button" class="lb-btn pri" id="lbX">Close</button></div>' +
      '<div class="lb-body" id="lbB"><button type="button" class="lb-nav prev" id="lbP" aria-label="Previous">' + chev('M15 5l-7 7 7 7') + '</button>' +
      '<div class="lb-stage" id="lbS" aria-live="polite"></div>' +
      '<button type="button" class="lb-nav next" id="lbNx" aria-label="Next">' + chev('M9 5l7 7-7 7') + '</button></div>';
    document.body.appendChild(el);
    el.querySelector('#lbX').addEventListener('click', close);
    el.querySelector('#lbP').addEventListener('click', function () { show(idx - 1); });
    el.querySelector('#lbNx').addEventListener('click', function () { show(idx + 1); });
    el.querySelector('#lbB').addEventListener('click', function (e) { if (e.target.id === 'lbB' || e.target.id === 'lbS') close(); });
    el.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(dx < 0 ? idx + 1 : idx - 1);
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (!el || el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
      else if (e.key === 'Tab') {
        var f = el.querySelectorAll('a[href],button:not(:disabled)'); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function show(i) {
    if (!items.length) return;
    idx = Math.max(0, Math.min(items.length - 1, i));
    var f = items[idx], n = items.length;
    // pictures are called "Image 3" (their file names are long camera or screenshot codes); other files keep their name
    el.querySelector('#lbN').textContent = isPic(f) ? 'Image ' + (idx + 1) + (n > 1 ? ' of ' + n : '') : (n > 1 ? (idx + 1) + ' of ' + n + ' · ' : '') + (f.name || 'File');
    el.querySelector('#lbM').textContent = [f.by ? 'Added by ' + f.by : '', f.at ? when(f.at) : ''].filter(Boolean).join(' · ');
    var nw = el.querySelector('#lbNew'); nw.href = f.u;
    el.querySelector('#lbP').disabled = idx === 0;
    el.querySelector('#lbNx').disabled = idx === n - 1;
    el.querySelector('#lbP').hidden = el.querySelector('#lbNx').hidden = n < 2;
    var s = el.querySelector('#lbS');
    var card = function (why) {
      var big = /pdf/i.test(f.mime || '') ? 'PDF' : /^image\//.test(f.mime || '') ? 'Photo' : 'File';
      s.innerHTML = '<div class="lb-card"><div class="big">' + big + '</div><p>' + esc(why) + '</p><a class="lb-btn pri" href="' + esc(f.u) + '" target="_blank" rel="noopener">Open in new window</a></div>';
    };
    if (isPic(f)) {
      s.innerHTML = '<img alt="' + esc(f.name || '') + '" src="' + esc(f.u) + '">';
      s.firstChild.addEventListener('error', function () { card('This picture did not load here.'); });
    } else card(/pdf/i.test(f.mime || '') ? 'A PDF opens in its own window.' : 'This file opens in its own window.');
    [idx - 1, idx + 1].forEach(function (j) { if (items[j] && isPic(items[j])) { var im = new Image(); im.src = items[j].u; } });
  }

  function open(i) {
    if (!el) build();
    back = document.activeElement;
    el.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    show(i);
    el.querySelector('#lbX').focus();
  }
  function close() {
    if (!el || el.hidden) return;
    el.hidden = true;
    document.documentElement.style.overflow = '';
    if (back && back.focus) { try { back.focus(); } catch (e) {} }
  }

  window.CmpGallery = {
    // thumbnails open the pop-up on a plain click; Ctrl, Cmd, Shift or the middle button keep the browser's own "open in a new tab"
    mount: function (box, list) {
      items = list || [];
      if (!box) return;
      box.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a.tk-file[data-i]');
        if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        open(parseInt(a.getAttribute('data-i'), 10) || 0);
      });
    },
    open: open, close: close
  };
})();
