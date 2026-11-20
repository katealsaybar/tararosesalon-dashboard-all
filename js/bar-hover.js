/* EVERY BAR LIFTS, GLOWS AND ANSWERS (Kate, 20 Nov 2026: "apply to all bars in the dashboard"; dashboard-report-builder component 42; styles in css/bar-hover.css).
   One shared piece instead of forty edits: a bar is any element whose inline style gives it a % width or height (the fill) inside a track, plus the few px-height column bars listed in
   PX_FILLS. The bar's ROW is the track itself when it holds words, otherwise the nearest ancestor that holds the label and the figures and no other track; a bar inside a table cell uses
   its table row (that row only glows, it does not lift). The row is marked data-bh (and made focusable); hover, focus or, on a phone, a tap shows one plain sentence made from the row's
   own words and numbers, never typed by hand. A bar can carry aria-label or title; a row can carry its own answer in data-tip. A button row (Service Rankings) keeps its own tap.
   Left alone, because they already answer on their own: the Recruitment pipeline, the November blasts, the Wellness Voucher Blast bars, the Target Calculator's rows, and any row that holds
   a data-tip of its own. Chart.js canvases and SVG charts have their own tooltips or none: not touched here. A page that wants better wording than the row's text calls
   TRSBars.say('<row selector>', function (row) { return 'sentence'; }). */
(function () {
  'use strict';
  var FILL = /(?:^|;)\s*(width|height)\s*:\s*(-?[\d.]+)%/;
  var SKIP = '#view-recruitment, #view-novblasts, #view-wvblast, .page-guide, .pg-guide, #verNotice, .upd, .sidebar, #sidebar, dialog, [data-bh-own], .rct-plwrow, .abr, input, select, textarea, .pill-select, .ps-pop, .tip, svg';
  // Column bars whose height is set in px, so the % test cannot see them (Over the Years). The parent is the column, which holds its value and label.
  var PX_FILLS = '.oty-bar > .b, .oty-bars .b, .mo-b, .sm-b';
  var card = null, hideT = null, saying = [];

  function pctOf(el) { var m = FILL.exec(el.getAttribute('style') || ''); return m ? { dim: m[1], v: parseFloat(m[2]) } : null; }

  // What a row says: its own lines of text, one after another, plus the bar's aria-label or title when it has one.
  function lines(row) {
    var raw = (row.innerText || row.textContent || '').split(/\n+/), out = [];
    raw.forEach(function (l) { l = l.replace(/\s+/g, ' ').trim(); if (l && out[out.length - 1] !== l) out.push(l); });
    return out;
  }
  function sentence(row) {
    for (var i = 0; i < saying.length; i++) {
      if (row.matches(saying[i][0])) { try { var v = saying[i][1](row); if (v) return v; } catch (e) { /* fall back to the row's own words */ } }
    }
    if (row.getAttribute('data-tip')) return row.getAttribute('data-tip');
    var s = lines(row).join(' · ').replace(/(\s·)+\s*$/, '');
    var fills = row.querySelectorAll('[data-bh-fill]'), lab = '', k;
    for (k = 0; k < fills.length && !lab; k++) {
      var par = fills[k].parentElement;
      lab = fills[k].getAttribute('aria-label') || fills[k].getAttribute('title') || (par && (par.getAttribute('aria-label') || par.getAttribute('title'))) || '';
    }
    var img = row.querySelector('[role=img][aria-label]'); if (!lab && img) lab = img.getAttribute('aria-label');
    if (lab && s.indexOf(lab) < 0) s = s ? s + '. ' + lab : lab;
    var p = fills.length === 1 ? pctOf(fills[0]) : null;
    if (p && p.v <= 100.5 && s && s.indexOf('%') < 0) s += '. The bar is ' + Math.round(p.v) + '% full';
    if (!s) return '';
    if (s.length > 240) s = s.slice(0, 237).replace(/\s+\S*$/, '') + '...';
    return /[.!?]$/.test(s) ? s : s + '.';
  }

  // Does this node hold only the one track (a stacked or split bar is one bar)?
  function onlyTrack(node, track) {
    var f = node.querySelectorAll('[data-bh-fill]');
    for (var i = 0; i < f.length; i++) if (f[i].parentElement !== track) return false;
    return true;
  }
  // A bar inside a table cell: its table row. Otherwise the track when it has words of its own (a column with its value and label), else the first ancestor with words and no other track.
  function rowFor(fill) {
    var cell = fill.closest('td, th'); if (cell && cell.closest('tr')) return cell.closest('tr');
    var track = fill.parentElement; if (!track) return null;
    var best = track, cur = track.parentElement;
    // up to the widest block that holds only this one bar and is still a line or a small card: its label and its figures are in there
    for (var steps = 0; cur && cur !== document.body && steps < 4; steps++, cur = cur.parentElement) {
      if (!onlyTrack(cur, track) || cur.getBoundingClientRect().height > 140) break;
      best = cur;
    }
    return best;
  }

  function scan() {
    if (document.hidden) return;
    var i, n = 0, cand = document.querySelectorAll('[style*="width"],[style*="height"]');
    for (i = 0; i < cand.length && n < 1500; i++) {
      var el = cand[i], p = pctOf(el);
      if (!p || p.v <= 0 || p.v > 100.5 || el.hasAttribute('data-bh-fill') || el._bhTry > 4 || el.closest(SKIP)) continue;
      el._bhTry = (el._bhTry || 0) + 1;   // an element that is not a bar is looked at a few times (it may still be loading), then left alone
      var par = el.parentElement; if (!par) continue;
      var r = el.getBoundingClientRect(), pr = par.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // a real bar: visible, thin, inside a longer track. Not a modal, a spinner, a tile or a whole card.
      var ok = p.dim === 'width' ? (r.height >= 2 && r.height <= 42 && pr.width >= 40 && pr.width >= r.width - 1)
                                 : (r.width >= 3 && r.width <= 90 && pr.height >= 24 && pr.height >= r.height - 1);
      if (!ok) continue;
      n++; el.setAttribute('data-bh-fill', '');
    }
    var px = document.querySelectorAll(PX_FILLS);
    for (i = 0; i < px.length; i++) if (!px[i].closest(SKIP) && px[i].getClientRects().length) px[i].setAttribute('data-bh-fill', '');
    var fills = document.querySelectorAll('[data-bh-fill]');
    for (i = 0; i < fills.length; i++) {
      var row = rowFor(fills[i]);
      if (!row || row.hasAttribute('data-bh') || row.closest(SKIP) || row.querySelector('[data-tip]')) continue;
      if (row.getBoundingClientRect().height > 260) continue;
      row.setAttribute('data-bh', '');
      if (row.querySelectorAll('[data-bh-fill]').length > 1) row.setAttribute('data-bh-multi', '');   // a stacked bar: its colours are not glowed over
      if (row.tagName !== 'TR' && !row.matches('a,button,input,select,textarea,[tabindex]')) row.setAttribute('tabindex', '0');
    }
  }

  function show(row, x, target) {
    if (target && target.closest && target.closest('.dn-cell, [data-dn], .dn')) { hide(); return; }   // a clickable segment already has its own card on this page
    var s = sentence(row); if (!s) return;
    if (!card) { card = document.createElement('div'); card.className = 'bh-card'; card.hidden = true; card.setAttribute('role', 'status'); document.body.appendChild(card); }
    card.textContent = s; card.hidden = false;
    var rc = row.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight, left = Math.max(8, Math.min(x - w / 2, innerWidth - w - 8)), top = rc.top - h - 10;
    if (top < 8) top = rc.bottom + 10;
    if (innerWidth <= 760) { left = 10; top = Math.max(8, Math.min(rc.top - h - 8, innerHeight - h - 8)); card.style.width = (innerWidth - 20) + 'px'; } else card.style.width = '';
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }
  function hide() { if (card) card.hidden = true; }
  var hov = function () { return matchMedia('(hover:hover)').matches; };
  var rowOf = function (t) { return t && t.closest ? t.closest('[data-bh]') : null; };
  var interactive = function (t) { return t && t.closest && t.closest('a,button,input,select,textarea,.dn,[data-dn]'); };

  document.addEventListener('mouseover', function (e) { var r = rowOf(e.target); if (r && hov()) show(r, e.clientX, e.target); else if (!r && hov()) hide(); });
  document.addEventListener('mousemove', function (e) { var r = rowOf(e.target); if (r && hov()) show(r, e.clientX, e.target); });
  document.addEventListener('mouseout', function (e) { var r = rowOf(e.target); if (r && hov() && !(e.relatedTarget && r.contains(e.relatedTarget))) hide(); });
  document.addEventListener('focusin', function (e) { var r = e.target && e.target.matches && e.target.matches('[data-bh]') ? e.target : null; if (r && hov()) show(r, r.getBoundingClientRect().left + 160); });
  document.addEventListener('focusout', function () { if (hov()) hide(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  document.addEventListener('click', function (e) {
    var r = rowOf(e.target);
    if (r && !interactive(e.target) && matchMedia('(hover:none)').matches) { show(r, e.clientX); clearTimeout(hideT); hideT = setTimeout(hide, 5000); }
    else if (!r) hide();
  });

  var queued = null;
  function queue() { clearTimeout(queued); queued = setTimeout(function () { try { scan(); } catch (e) { /* the page is fine without it */ } }, 500); }
  new MutationObserver(function (recs) {
    for (var i = 0; i < recs.length; i++) {
      var t = recs[i].target;
      if (t && t.nodeType === 1 && (t.closest('.bh-card') || t.hasAttribute('data-bh') || t.hasAttribute('data-bh-fill'))) continue;
      queue(); return;
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', queue);
  window.addEventListener('resize', queue);

  window.TRSBars = { say: function (sel, fn) { saying.push([sel, fn]); }, scan: scan, sentence: sentence };
})();
