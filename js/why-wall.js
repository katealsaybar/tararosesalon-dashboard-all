/* The shared Why wall (audit ALD Batch 3, X1, Kate 23 Oct 2026). One block at the top of a page: up to three lines (why this page, why now, if we do
   nothing), then one "This week" line with the one thing to do. Marketing Spend drew its own first; this is the same look for every other page, so a
   page gives its sentences and nothing else.

     whyWall([['Why this page', '...'], ['Why now', '...'], ['If we do nothing', '...']], 'One action, who, by when.')
     whyFoot()   the access sentence that used to open the page, reworded, for the foot

   Printed prompt only: nothing here is saved. The caller escapes anything that came from data; the sentences written in code are plain text. */
function whyWallEsc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function whyWall(items, thisWeek) {
  const list = (items || []).filter(it => it && it[1]);
  if (!list.length && !thisWeek) return '';
  const cells = list.map((it, i) =>
    `<div class="why-wall-i"><div class="why-wall-n">0${i + 1}</div><div class="why-wall-t">${whyWallEsc(it[0])}</div><div class="why-wall-b">${whyWallEsc(it[1])}</div></div>`).join('');
  return `<section class="why-wall" aria-label="Why this page">`
    + (cells ? `<div class="why-wall-g" style="--wn:${list.length}">${cells}</div>` : '')
    + (thisWeek ? `<p class="why-week"><b>This week.</b> ${whyWallEsc(thisWeek)}</p>` : '')
    + `</section>`;
}

// The sentence that used to open Podium Race, Quadrant, 13 Week and Benchmarks ("Dashboard sign-ins are for coordinators...").
function whyFoot() {
  return `<p class="why-foot">Stylists see their own numbers in My Numbers.</p>`;
}
