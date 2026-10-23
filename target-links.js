/* THE TARGET LINKS. Kate, 23 Oct 2026: every page or section that scores something against a target carries one line that opens the
   two pages that explain targets: How a Target Is Made (/targets/how/, the training steps) and the Target Calculator (/targets/, the
   plan per person). Both pages are Level 3 and Level 5 only (target_calc_data() refuses everyone else), so the line is drawn for those
   two levels and for nobody else: a Level 2 coordinator looking at the Daily Target Sheet is never sent to a wall.

   How it works. TL_ANCHORS names, per dashboard view, the element a line sits next to. After the page draws, and each time it draws
   again, this file puts the line there if it is not already there. A page does not have to change, and a page that redraws its whole
   body (most do) gets the line back without calling anything. The same pattern as jump-nav.js, and for the same reason.

   One anchor = { view, sel, pos, find, after, key, why }:
     view   the dashboard view the anchor lives in (#view-<id>)
     sel    the element the line sits beside; find is a regex tested against its text when several elements match the selector
     pos    'afterend' (default), 'beforebegin' or 'afterbegin', as insertAdjacentElement
     after  a selector for the sibling the line should follow instead, when the anchor is a title with its explanation under it
     key    the line's name, so it is drawn once per anchor
     why    the plain-English sentence: what the target on this page is, in the words the page uses
   Pages outside the dashboard (the Upload Portal's Targets tab) carry the same markup by hand with tlHtml()'s output, see upload/index.html. */

const TL_HOW = '/targets/how/', TL_CALC = '/targets/';

const TL_ANCHORS = [
  // The Pulse: the cover's scored bars, the red list under them, the green list.
  { view: 'dashboard', sel: '#heroTargets', key: 'pulse-cover', why: 'Every bar on the cover is scored against a monthly target. See how a target is made before you read the gap.' },
  { view: 'dashboard', sel: '#s-below', key: 'pulse-below', why: 'These are the measures under their target. The gap only means something if you know how the target was set.' },
  { view: 'dashboard', sel: '#s-working', key: 'pulse-working', why: 'These are on or over target. Check the target is fair before you celebrate it.' },
  // Comparison: each rate against its own side's target.
  { view: 'compare', sel: '.cmp-card .cmp-h', find: /^\s*Averages/i, after: '.cmp-what', key: 'compare-targets', why: 'Each average is read against its own side’s target, and “Fix first” above is the one furthest behind. This is how that target is made.' },
  // Daily Performance: the daily target is the monthly one spread over the trading days.
  { view: 'dailyperf', sel: '#dpCardA .dp-why', key: 'daily-measure', why: 'The daily target is the monthly target spread over the days the branch trades.' },
  { view: 'dailyperf', sel: '#dpCardS .dp-head', key: 'daily-staff', why: 'Each person’s share of the target comes from the same plan.' },
  // The Ledgers: the three target pages Coach Emma's sheet sits behind.
  { view: 'ledgerTargets', sel: '.lg-head', key: 'ledger-sheet', why: 'The monthly targets on this sheet are the ones loaded for the month. Here is how one is built.' },
  { view: 'ledgerStylist', sel: '.lg-head', key: 'ledger-stylist', why: 'Each stylist’s target is her plan for the month. Here is how a plan is built.' },
  { view: 'ledgerActuals', sel: '.lg-head', key: 'ledger-actuals', why: 'Actuals are measured against the loaded target. Here is how that target is built.' },
  // Team Performance: four targets on every card.
  { view: 'team', sel: '#teamContent .section-label', key: 'podium', pos: 'beforebegin', why: 'The rings are filled to the share of each target reached. Here is where the targets come from.' },
  { view: 'teamquad', sel: '#teamQuadContent .tp-q-grp', key: 'quad', pos: 'beforebegin', why: 'Treatment and retail are scored against their share of the plan. Here is how that share is set.' },
];

function tlEligible() {
  // TRS_LEVEL is the signed-in level, or the level View as is showing; it is null until the sign-in has answered.
  try { return typeof TRS_LEVEL !== 'undefined' && (TRS_LEVEL === 3 || TRS_LEVEL === 5); } catch (e) { return false; }
}

function tlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// The line itself. Order is the adult-learning order: what it is (the label), why it matters (the sentence), what to do (the buttons).
function tlHtml(why, key) {
  return `<div class="tl" role="note" data-tl="${tlEsc(key || '')}"><span class="tl-k">Where the target comes from</span>`
    + `<span class="tl-t">${tlEsc(why)}</span>`
    + `<span class="tl-b"><a class="tl-a" href="${TL_HOW}" target="_blank" rel="noopener" title="Opens in a new tab">How a target is made<span aria-hidden="true"> ↗</span></a>`
    + `<a class="tl-a tl-p" href="${TL_CALC}" target="_blank" rel="noopener" title="Opens in a new tab">Open the Target Calculator<span aria-hidden="true"> ↗</span></a></span></div>`;
}

function tlPlace(a) {
  const box = document.getElementById('view-' + a.view);
  if (!box) return;
  let anchor = null;
  const hits = [...box.querySelectorAll(a.sel)];
  anchor = a.find ? hits.find(el => a.find.test(el.textContent)) : hits[0];
  if (!anchor) return;
  if (a.after) { const s = anchor.parentElement && anchor.parentElement.querySelector(a.after); if (s) anchor = s; }
  const pos = a.pos || 'afterend';
  // Already there: the line is a sibling of the anchor, never inside it, so look at the neighbour on the side it would go.
  const next = pos === 'beforebegin' ? anchor.previousElementSibling : pos === 'afterbegin' ? anchor.firstElementChild : anchor.nextElementSibling;
  if (next && next.classList && next.classList.contains('tl') && next.getAttribute('data-tl') === a.key) return;
  if (box.querySelector('.tl[data-tl="' + a.key + '"]')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = tlHtml(a.why, a.key);
  anchor.insertAdjacentElement(pos, wrap.firstElementChild);
}

let tlTimer = 0;
function tlSweep() {
  if (!tlEligible()) { document.querySelectorAll('.tl[data-tl]').forEach(el => { if (el.closest('[id^="view-"]')) el.remove(); }); return; }
  TL_ANCHORS.forEach(a => { try { tlPlace(a); } catch (e) { /* the page is fine without the line */ } });
}
function tlQueue() { clearTimeout(tlTimer); tlTimer = setTimeout(tlSweep, 300); }

(function tlBoot() {
  const root = document.getElementById('mainScrollArea') || document.body;
  new MutationObserver(recs => {
    // Our own insertions must not wake us again.
    if (recs.every(m => [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType !== 1 || (n.classList && n.classList.contains('tl'))))) return;
    tlQueue();
  }).observe(root, { childList: true, subtree: true });
  // The level arrives after the sign-in answers, with no change to the page to say so: look again a few times early on.
  [1000, 3000, 8000, 20000].forEach(ms => setTimeout(tlSweep, ms));
  tlQueue();
})();
