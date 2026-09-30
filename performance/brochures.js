// The employment-model brochures as a swipe viewer, for employment-models.html,
// which each "Read the brochure" on a stylist's page opens in a new window (Kate,
// 30 Sep 2026). A port of the GHL Custom Code block Kate had on
// promo.tararosesalon.com/employment-models (Downloads/EMPLOYMENT MODELS/
// employment-brochures-ghl-code.html): pills to switch brochure, pages drawn from
// the PDF with PDF.js, a mint progress dash, arrows, and Download PDF for the
// real file. The PDFs are the local copies in performance/brochures/, not GHL
// media, and the GHL logo is left out (the page has its own brand bar).
//
// mountBrochures(root, list, startKey, onPick) fills root. onPick(key) runs when
// someone taps a pill, so the page can keep ?b= in step for a shareable link.

const BR_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let brPdfReady = null;
const brCache = {};   // pdf url -> array of rendered canvases

function brLoadPdfJs() {
  if (brPdfReady) return brPdfReady;
  brPdfReady = new Promise((resolve, reject) => {
    const done = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = BR_PDFJS + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
    if (window.pdfjsLib) return done();
    const s = document.createElement('script');
    s.src = BR_PDFJS + 'pdf.min.js';
    s.onload = () => (window.pdfjsLib ? done() : reject());
    s.onerror = reject;
    document.head.appendChild(s);
  });
  brPdfReady.catch(() => { brPdfReady = null; });   // let a later mount try again
  return brPdfReady;
}

// The PDFs end with a "How to join" contact block (website + recruitment email)
// that shouldn't show here. It sits at the bottom of its page, so paint over it
// from its heading down to just above the footer, in the page's own background.
// A page that is only the contact block is dropped. Download PDF still has it.
function brHideContact(c, ctx, pageH, text) {
  const lines = {};
  text.items.forEach(it => { const y = Math.round(it.transform[5]); (lines[y] = lines[y] || []).push(it); });
  let top = null;
  Object.keys(lines).forEach(y => {
    const s = lines[y].sort((a, b) => a.transform[4] - b.transform[4])
      .map(i => i.str).join('').replace(/\s+/g, '').toUpperCase();
    if (/HOWTOJOIN|CONVERSATIONSAREALWAYSWELCOME/.test(s)) {
      const fromTop = (pageH - Number(y)) / pageH;
      if (top === null || fromTop < top) top = fromTop;
    }
  });
  if (top === null) return c;
  top -= 0.03;                  // heading baseline -> top of its icon and cap height
  if (top < 0.15) return null;  // nothing else on the page
  const y0 = Math.round(top * c.height), y1 = Math.round(0.935 * c.height);  // footer rule sits at ~94%
  const px = ctx.getImageData(4, Math.max(0, y0 - 4), 1, 1).data;
  ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
  ctx.fillRect(0, y0, c.width, y1 - y0);
  return c;
}

function mountBrochures(root, list, startKey, onPick) {
  root.innerHTML = `
    <div class="br-wrap">
      <div class="br-pills"></div>
      <div class="br-stage">
        <div class="br-dashes"><div class="br-fill"></div></div>
        <div class="br-loading">Loading</div>
        <div class="br-swipe"></div>
        <button class="br-arrow prev" type="button" aria-label="Previous page" hidden>&lsaquo;</button>
        <button class="br-arrow next" type="button" aria-label="Next page" hidden>&rsaquo;</button>
      </div>
      <div class="br-actions">
        <span class="br-count"></span>
        <a class="br-dl" href="#" target="_blank" rel="noopener">Download PDF</a>
      </div>
    </div>`;
  const $ = sel => root.querySelector(sel);
  const pills = $('.br-pills'), swipe = $('.br-swipe'), fill = $('.br-fill'), loading = $('.br-loading'),
    prev = $('.br-arrow.prev'), next = $('.br-arrow.next'), count = $('.br-count'), dl = $('.br-dl');
  let current = null;   // guards against a slow render landing after a switch

  list.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'br-pill'; btn.textContent = b.label; btn.dataset.key = b.key;
    btn.addEventListener('click', () => { show(b.key); if (onPick) onPick(b.key); });
    pills.appendChild(btn);
  });

  const page = () => (swipe.clientWidth ? Math.round(swipe.scrollLeft / swipe.clientWidth) : 0);
  function update() {
    const n = swipe.children.length;
    if (!n) { fill.style.width = '0%'; prev.hidden = next.hidden = true; count.textContent = ''; return; }
    const max = swipe.scrollWidth - swipe.clientWidth;
    fill.style.width = (max > 0 ? Math.min(100, swipe.scrollLeft / max * 100) : 100) + '%';
    const p = page();
    prev.hidden = p <= 0;
    next.hidden = p >= n - 1;
    count.textContent = `${p + 1} / ${n}`;
  }
  swipe.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  prev.addEventListener('click', () => swipe.scrollBy({ left: -swipe.clientWidth }));
  next.addEventListener('click', () => swipe.scrollBy({ left: swipe.clientWidth }));

  function mount(canvases) {
    swipe.style.scrollBehavior = 'auto';
    swipe.innerHTML = '';
    canvases.forEach(c => { const d = document.createElement('div'); d.appendChild(c); swipe.appendChild(d); });
    swipe.scrollLeft = 0;
    swipe.style.scrollBehavior = '';
    update();
  }

  function render(b) {
    // Each page at the stage width x device pixel ratio, so text stays crisp on phones.
    const target = Math.max(swipe.clientWidth, 320) * Math.min(window.devicePixelRatio || 1, 2.5);
    return brLoadPdfJs().then(lib => lib.getDocument(b.pdf).promise).then(doc => {
      const jobs = [];
      for (let i = 1; i <= doc.numPages; i++) {
        jobs.push(doc.getPage(i).then(pg => {
          const base = pg.getViewport({ scale: 1 });
          const vp = pg.getViewport({ scale: target / base.width });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          c.setAttribute('aria-label', `${b.title}, page ${pg.pageNumber}`);
          const ctx = c.getContext('2d');
          // intent 'print' skips PDF.js's requestAnimationFrame pacing, which stalls in background tabs.
          return Promise.all([
            pg.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise,
            pg.getTextContent(),
          ]).then(r => brHideContact(c, ctx, base.height, r[1]));
        }));
      }
      return Promise.all(jobs).then(cs => cs.filter(Boolean));
    });
  }

  function show(key) {
    const b = list.find(x => x.key === key) || list[0];
    current = b.key;
    pills.querySelectorAll('.br-pill').forEach(p => p.classList.toggle('on', p.dataset.key === b.key));
    const on = pills.querySelector('.br-pill.on');
    if (on) pills.scrollLeft = on.offsetLeft - (pills.clientWidth - on.offsetWidth) / 2;
    dl.href = b.pdf;
    if (brCache[b.pdf]) { loading.style.display = 'none'; mount(brCache[b.pdf]); return; }
    loading.textContent = 'Loading'; loading.style.display = 'flex';
    mount([]);
    render(b).then(canvases => {
      brCache[b.pdf] = canvases;
      if (current !== b.key) return;
      loading.style.display = 'none';
      mount(canvases);
    }).catch(() => {
      if (current !== b.key) return;
      loading.textContent = 'Tap Download PDF to read';
    });
  }

  show(startKey || list[0].key);
}
