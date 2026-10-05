/* ============================================================
   TARA ROSE SALONS: one dropdown for the whole site (Kate, 3 Oct 2026)
   assets/pill-select.js

   Every <select> on a page that loads this file is drawn as the dashboard's soft
   pill menu (spfDD in index.html, KB.pillDD on Team Home): a rounded button, and a
   rounded list with pill options, the chosen one filled in the accent colour. The
   browser's square native list is gone everywhere.

   The <select> itself stays in the page, invisible, so nothing else changes: it keeps
   the value, its onchange handler, form submission and the "required" check (the
   browser's message points at the button). New selects are picked up as they are
   added, and a value or option list changed in code redraws the button.

   Left alone: a select inside .spf-dd, .pdd or .kb-dd (already drawn by those),
   multiple or size > 1 lists, and any select with data-native.

   Colours come from the page: the dashboard's --surface/--border/--text/--accent,
   or the voucher pages' --paper/--line/--ink/--accent.
   ============================================================ */
(function () {
  if (window.TRSPillSelect) return;

  var css = [
    '.ps{position:relative;display:inline-flex;max-width:100%;vertical-align:middle;',
    '  --ps-surface:var(--surface,var(--paper,#fff));--ps-border:var(--border,var(--line,var(--stone,#E8E2D6)));',
    '  --ps-text:var(--text,var(--ink,#1A1A1A));--ps-hover:var(--surface2,var(--cream,rgba(0,0,0,.05)));',
    '  --ps-on:var(--accent,#1A1A1A);--ps-on-fg:var(--accent-fg,var(--ink,#1A1A1A));--ps-muted:var(--muted2,var(--muted,var(--ink-soft,#77706A)))}',
    '.ps>select{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;',
    '  opacity:0!important;pointer-events:none!important;z-index:-1}',
    '.ps-btn{appearance:none;display:inline-flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-width:0;',
    '  font:inherit;font-weight:500;line-height:1.3;color:var(--ps-text);background:var(--ps-surface);border:1px solid var(--ps-border);',
    '  border-radius:999px;padding:8px 14px;cursor:pointer;text-align:left;transition:border-color .15s}',
    '.ps-btn>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ps-btn.ps-ph>span{color:var(--ps-muted);font-weight:400}',
    '.ps-btn svg{width:10px;height:10px;flex:none;opacity:.6;transition:transform .18s}',
    '@media(hover:hover){.ps-btn:not(:disabled):hover{border-color:var(--ps-text)}}',
    '.ps.open .ps-btn{border-color:var(--ps-text)}',
    '.ps.open .ps-btn svg{transform:rotate(180deg)}',
    '.ps-btn:disabled{opacity:.5;cursor:default}',
    '.ps-btn:focus-visible,.ps-menu button:focus-visible{outline:2px solid var(--ps-on);outline-offset:2px}',
    '.ps-menu{position:fixed;z-index:10000;display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:16px;',
    '  background:var(--ps-surface);border:1px solid var(--ps-border);color:var(--ps-text);',
    '  box-shadow:0 2px 4px rgba(26,26,26,.07),0 18px 40px -10px rgba(26,26,26,.22);max-height:320px;overflow-y:auto;',
    '  font-family:inherit;-webkit-overflow-scrolling:touch}',
    '.ps-menu button{appearance:none;border:0;background:transparent;color:inherit;text-align:left;white-space:nowrap;',
    '  font:inherit;font-size:13.5px;font-weight:500;padding:7px 14px;border-radius:999px;cursor:pointer;transition:background .15s;flex:none}',
    '@media(hover:hover){.ps-menu button:not(:disabled):hover{background:var(--ps-hover)}}',
    '.ps-menu button.on{background:var(--ps-on);color:var(--ps-on-fg);font-weight:700}',
    '.ps-menu button:disabled{opacity:.45;cursor:default}',
    '.ps-menu .ps-grp{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;opacity:.6;padding:8px 14px 3px;flex:none}',
    // Kate, 5 Oct 2026: on a phone (the site's 760px band) or any touch screen the pill is a
    // 44px tap and each option a 40px row (they were about 35 and 32), and an empty select
    // no longer draws a squat 28px pill.
    '@media(max-width:760px),(pointer:coarse){.ps-btn{min-height:44px}.ps-menu button{min-height:40px}.ps-menu .ps-grp{font-size:12px}}'
  ].join('\n');
  var style = document.createElement('style');
  style.id = 'pill-select-css';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  var CHEV = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function skip(sel) {
    return sel.multiple || sel.size > 1 || sel.hasAttribute('data-native') || sel._ps ||
      (sel.parentNode && sel.parentNode.closest && sel.parentNode.closest('.spf-dd,.pdd,.kb-dd'));
  }

  var openOne = null;
  function closeOpen() { if (openOne) openOne.close(); }

  function enhance(sel) {
    if (skip(sel)) return;
    // A width set in CSS as a percentage (100% in a form) carries over to the pill.
    var w = getComputedStyle(sel).width;
    var wrap = document.createElement('span');
    wrap.className = 'ps';
    if (/%$/.test(w)) wrap.style.width = w;
    else if (sel.style.width) wrap.style.width = sel.style.width;
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.tabIndex = -1;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ps-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var label = sel.getAttribute('aria-label') || (sel.labels && sel.labels[0] && sel.labels[0].textContent.trim()) || sel.name || '';
    if (label) btn.setAttribute('aria-label', label);
    if (sel.id) btn.id = 'ps-' + sel.id;
    wrap.appendChild(btn);
    var menu = null;

    function paint() {
      var cur = sel.options[sel.selectedIndex];
      btn.innerHTML = '<span>' + esc(cur ? cur.text : '') + '</span>' + CHEV;
      btn.classList.toggle('ps-ph', !!cur && cur.value === '' && cur.disabled);
      btn.disabled = sel.disabled;
      if (menu) build();
    }
    function build() {
      var html = '', i = 0;
      [].forEach.call(sel.children, function (n) {
        if (n.tagName === 'OPTGROUP') {
          html += '<div class="ps-grp" role="presentation">' + esc(n.label) + '</div>';
          [].forEach.call(n.children, function (o) { html += opt(o); });
        } else if (n.tagName === 'OPTION') html += opt(n);
      });
      function opt(o) {
        var on = o.selected, idx = o.index;
        if (o.hidden) return '';
        return '<button type="button" role="option" data-i="' + idx + '" aria-selected="' + on + '"' +
          (on ? ' class="on"' : '') + (o.disabled ? ' disabled' : '') + '>' + esc(o.text) + '</button>';
      }
      menu.innerHTML = html;
    }
    function place() {
      var r = btn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
      menu.style.minWidth = Math.round(r.width) + 'px';
      menu.style.maxWidth = (vw - 16) + 'px';
      var below = vh - r.bottom - 12, above = r.top - 12;
      var up = below < Math.min(menu.scrollHeight, 220) && above > below;
      menu.style.maxHeight = Math.max(140, Math.min(320, up ? above : below)) + 'px';
      var mw = menu.offsetWidth, mh = menu.offsetHeight;
      var top = up ? r.top - 6 - mh : r.bottom + 6, left = r.left;
      if (left + mw > vw - 8) left = Math.max(8, r.right - mw);
      menu.style.top = top + 'px'; menu.style.left = left + 'px';
      // Inside a transformed box "fixed" is measured from that box, not the screen;
      // nudge by whatever difference shows up so the list still sits on its button.
      var m = menu.getBoundingClientRect();
      if (Math.abs(m.top - top) > 1 || Math.abs(m.left - left) > 1) {
        menu.style.top = (2 * top - m.top) + 'px'; menu.style.left = (2 * left - m.left) + 'px';
      }
    }
    function open() {
      closeOpen();
      menu = document.createElement('div');
      menu.className = 'ps-menu';
      menu.setAttribute('role', 'listbox');
      if (label) menu.setAttribute('aria-label', label);
      // The page's font, not the body's, when a select sits in a styled area.
      menu.style.fontFamily = getComputedStyle(btn).fontFamily;
      build();
      wrap.appendChild(menu);
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      place();
      var on = menu.querySelector('button.on') || menu.querySelector('button:not(:disabled)');
      // Scroll the list, never the page (a page scroll closes the menu).
      if (on) { menu.scrollTop = Math.max(0, on.offsetTop - menu.clientHeight / 2); on.focus({ preventScroll: true }); }
      openOne = api;
    }
    function close(refocus) {
      if (!menu) return;
      menu.remove(); menu = null;
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (openOne === api) openOne = null;
      if (refocus) btn.focus();
    }
    function pick(i) {
      close(true);
      if (sel.selectedIndex === i) return;
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var api = { close: close, paint: paint, wrap: wrap };

    btn.addEventListener('click', function (e) { e.stopPropagation(); if (menu) close(); else open(); });
    btn.addEventListener('keydown', function (e) {
      if (!menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open(); }
    });
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.ps-menu button');
      if (b && !b.disabled) { e.stopPropagation(); pick(+b.dataset.i); }
    });
    var typed = '', typedAt = 0;
    wrap.addEventListener('keydown', function (e) {
      if (!menu) return;
      var bs = [].slice.call(menu.querySelectorAll('button:not(:disabled)')), i = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = bs[e.key === 'ArrowDown' ? Math.min(i + 1, bs.length - 1) : Math.max(i - 1, 0)];
        if (n) n.focus();
      } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); (e.key === 'Home' ? bs[0] : bs[bs.length - 1]).focus(); }
      else if (e.key.length === 1 && /\S/.test(e.key)) {
        // Type to jump, as a native list does (the country codes are a long list).
        var now = Date.now();
        typed = (now - typedAt > 700 ? '' : typed) + e.key.toLowerCase(); typedAt = now;
        var hit = bs.find(function (b) { return b.textContent.replace(/^\W+/, '').toLowerCase().indexOf(typed) === 0; }) ||
                  bs.find(function (b) { return b.textContent.toLowerCase().indexOf(typed) >= 0; });
        if (hit) hit.focus();
      }
    });
    // The browser's "please select an item" message points at the button.
    sel.addEventListener('invalid', function () { btn.focus(); });
    sel.addEventListener('change', paint);
    // Options rebuilt, or disabled switched, in code.
    new MutationObserver(paint).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'selected'] });
    sel._ps = api;
    paint();
  }

  // A value set in code (sel.value = x) fires no event; redraw the pill anyway.
  function hook(proto, prop) {
    var d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) {
        d.set.call(this, v);
        var s = this.tagName === 'OPTION' ? this.parentNode && this.parentNode.closest && this.parentNode.closest('select') : this;
        if (s && s._ps) s._ps.paint();
      }
    });
  }
  hook(HTMLSelectElement.prototype, 'value');
  hook(HTMLSelectElement.prototype, 'selectedIndex');
  hook(HTMLOptionElement.prototype, 'selected');

  function scan(root) {
    if (root.tagName === 'SELECT') return enhance(root);
    var list = root.getElementsByTagName ? root.getElementsByTagName('select') : [];
    if (list.length) [].slice.call(list).forEach(enhance);
  }
  function start() {
    scan(document);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  document.addEventListener('click', function (e) { if (openOne && !openOne.wrap.contains(e.target)) closeOpen(); });
  // A fixed menu would drift from its button; close it on page scroll or resize.
  window.addEventListener('scroll', function (e) {
    if (openOne && !(e.target.closest && e.target.closest('.ps-menu'))) closeOpen();
  }, true);
  window.addEventListener('resize', closeOpen);

  window.TRSPillSelect = { enhance: enhance, scan: scan };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
