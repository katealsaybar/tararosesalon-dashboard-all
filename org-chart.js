// -- ORG CHART -------------------------
// The whole group, from Kate's Canva "STAFF CARD-A3" reference (screenshotted +
// PDF'd to Kate 19 Sep 2026). The Canva deck has no connector lines at all —
// it is pure spatial grouping under section-header boxes (BAHRAIN BRANCH,
// MARKETING & OPERATIONS, etc.) — so every reporting line below is Kate's
// verbal confirmation, not read off the artwork. Two spelling fixes made here
// vs the Canva source (Kate confirmed, 19 Sep 2026): "Social Media Manageer"
// -> "Social Media Manager", "Call Centre Recetionist" -> "Call Centre
// Receptionist". Fix the Canva deck itself separately — this file doesn't
// feed it.
//
// Add a new team by pushing another entry with the same node shape:
//   { name, role, children: [...] }        (children optional)
const ORG_CHART = [
  {
    id: 'group',
    label: 'Tara Rose Group',
    colour: '#FFD4D9',
    root: {
      name: 'Tara Rose Kidd',
      role: 'Founder & Managing Director',
      photo: 'assets/org-chart/tara-rose-kidd.png',
      children: [
        { name: 'Daisy Charlotte Cropper', role: 'Managing Director, Tara Rose Bahrain', photo: 'assets/org-chart/daisy-charlotte-cropper.png' },
        { name: 'Mette Haxthausen', role: 'Executive Partner (Salon Consultant)', photo: 'assets/org-chart/mette-haxthausen.png' },
        {
          name: 'Core Team',
          role: 'Department',
          children: [
            { name: 'Hanneh Rose Rejas', role: 'Social Media Manager', photo: 'assets/org-chart/hanneh-rose-rejas.png' },
            { name: 'Kate Alsaybar', role: 'Operations and Performance Manager, EA', photo: 'assets/org-chart/kate-alsaybar.png' },
            {
              name: 'Emma-Louise Usher',
              role: 'General Manager',
              photo: 'assets/org-chart/emma-louise-usher.png',
              children: [
                {
                  name: 'Call Centre Team',
                  role: 'Department',
                  children: [
                    {
                      name: 'Christabelle Bustos',
                      role: 'Call Centre Team Lead',
                      photo: 'assets/org-chart/christabelle-bustos.png',
                      children: [
                        { name: 'Hazel Alcala', role: 'Call Centre Receptionist', photo: 'assets/org-chart/hazel-alcala.png' },
                      ],
                    },
                  ],
                },
                {
                  name: 'Educators',
                  role: 'Department',
                  children: [
                    { name: 'Emma Williamson', role: 'Treatments & Retail Educator', photo: 'assets/org-chart/emma-williamson.png' },
                    { name: 'Ashleigh Fairgrieve', role: 'Blondes & Extensions Educator', photo: 'assets/org-chart/ashleigh-fairgrieve.png' },
                  ],
                },
                { name: 'Ruth Bocock', role: 'Salon Manager, Al Quoz Branch', photo: 'assets/org-chart/ruth-bocock.png', dropToPhotoRow: true },
                {
                  name: 'Salon Coordinators',
                  role: 'Department',
                  children: [
                    { name: 'Jhoana Cairel', role: 'Salon Coordinator, Khalifa City Branch', photo: 'assets/org-chart/jhoana-cairel.png' },
                    { name: 'Cristine Bracamonte', role: 'Salon Coordinator, Saadiyat Branch', photo: 'assets/org-chart/cristine-bracamonte.png?v=20260925' },
                    { name: 'Frances Pia Sergio', role: 'Salon Coordinator, Al Quoz Branch', photo: 'assets/org-chart/frances-pia-sergio.png' },
                    { name: 'Shiela Avena', role: 'Salon Coordinator, Motor City Branch', photo: 'assets/org-chart/shiela-avena.png' },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'Accounts & Admin',
          role: 'Department',
          children: [
            {
              name: 'Jumera Chavenia',
              role: 'Accounts and Admin Head',
              photo: 'assets/org-chart/jumera-chavenia.png',
              children: [
                {
                  name: 'Mary Ann Yanson',
                  role: 'Accounts Manager',
                  photo: 'assets/org-chart/mary-ann-yanson.png',
                  children: [
                    { name: 'Suncirie Pedrosa', role: 'Accounts Officer', photo: 'assets/org-chart/suncirie-pedrosa.png' },
                  ],
                },
                { name: 'Jeanylyn Pacada', role: 'HR & Admin Officer', photo: 'assets/org-chart/jeanylyn-pacada.png' },
              ],
            },
          ],
        },
      ],
    },
  },
];

function ocNode(node, isHead) {
  const children = node.children && node.children.length
    ? `<ul>${node.children.map(c => ocNode(c, false)).join('')}</ul>`
    : '';
  const photo = node.photo
    ? `<img class="oc-photo" src="${encodeURI(node.photo)}" alt="" loading="lazy" onerror="this.remove()">`
    : '';
  return `
    <li${node.dropToPhotoRow ? ' class="oc-drop"' : ''}>
      <div class="oc-node${isHead ? ' is-head' : ''}${node.photo ? ' has-photo' : ''}">
        ${photo}
        <div class="oc-name">${escapeHtml(node.name)}</div>
        <div class="oc-role">${escapeHtml(node.role || '')}</div>
      </div>
      ${children}
    </li>`;
}

// Zoom range for the container's --oc-scale (see the CSS comment above the
// .oc-container rules): a real reflow via calc(), never a transform, so the
// connector lines drawOcConnectors() draws from live getBoundingClientRect()
// values stay put instead of being scaled twice.
const OC_ZOOM_MIN = 0.55, OC_ZOOM_MAX = 1.4, OC_ZOOM_STEP = 0.1;
let ocScale = 1;

function renderOrgChart() {
  const host = document.getElementById('orgChartContent');
  if (!host) return;
  if (typeof ORG_CHART === 'undefined' || !ORG_CHART.length) {
    host.innerHTML = `<div class="loading">No teams added yet.</div>`;
    return;
  }
  ocScale = 1;
  host.innerHTML = `
    <div class="oc-container" id="ocContainer" style="--oc-scale:1">
      <div class="oc-zoom-controls">
        <button class="oc-zoom-btn" type="button" onclick="ocZoom(-1)" aria-label="Zoom out">−</button>
        <button class="oc-zoom-btn" type="button" onclick="ocZoom(1)" aria-label="Zoom in">+</button>
      </div>
      ${ORG_CHART.map(team => `
        <div class="oc-section">
          <div class="section-label" style="display:flex;align-items:center;gap:7px;margin-bottom:14px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                         background:${team.colour};flex-shrink:0"></span>
            ${escapeHtml(team.label)}
          </div>
          <ul class="oc-tree">${ocNode(team.root, true)}</ul>
        </div>
      `).join('')}
    </div>
  `;
  host.querySelectorAll('.oc-tree').forEach(drawOcConnectors);

  // Opened as its own popped-out window (ocOpenNewWindow() below sets this):
  // fit the widest team to the window instead of leaving Kate to scroll
  // sideways to find everyone. Kate, 21 Sep 2026.
  if (new URLSearchParams(location.search).get('ocFit') === '1') {
    requestAnimationFrame(ocFitToWindow);
  }

  if (!window.__ocResizeBound) {
    window.__ocResizeBound = true;
    let t;
    addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => host.querySelectorAll('.oc-tree').forEach(drawOcConnectors), 150);
    });
  }
}

// The raw setter behind ocSetZoom, without OC_ZOOM_MIN/MAX — the on-screen
// zoom buttons need that floor so the boxes never go illegibly small, but
// ocPrint() below sometimes has to shrink well past it to get a wide chart
// onto one printed page, and that's fine since it's not meant to be read
// zoomed-in on a screen.
function ocApplyScale(scale) {
  ocScale = +scale.toFixed(3);
  const el = document.getElementById('ocContainer');
  if (!el) return;
  el.style.setProperty('--oc-scale', ocScale);
  el.querySelectorAll('.oc-tree').forEach(drawOcConnectors);
}

function ocSetZoom(scale) {
  ocApplyScale(Math.min(OC_ZOOM_MAX, Math.max(OC_ZOOM_MIN, scale)));
}

function ocZoom(dir) {
  ocSetZoom(ocScale + dir * OC_ZOOM_STEP);
}

// Shrinks the chart just enough that its widest team fits the window with no
// side-scrolling — the state the popped-out window opens into.
function ocFitToWindow() {
  const container = document.getElementById('ocContainer');
  if (!container) return;
  ocSetZoom(1); // measure from the natural size, not whatever zoom is live
  let widest = 0;
  container.querySelectorAll('.oc-tree').forEach(t => { widest = Math.max(widest, t.scrollWidth); });
  if (!widest) return;
  const available = container.clientWidth - 8;
  if (widest > available) ocSetZoom(available / widest);
}

// The masthead's "Open in new window" link — a separate window so Kate can
// project or share it standalone, pre-zoomed to fit everyone on screen.
function ocOpenNewWindow() {
  const url = new URL(location.href);
  url.searchParams.set('view', 'orgchart');
  url.searchParams.set('ocFit', '1');
  window.open(url.toString(), '_blank', 'noopener');
}

// A landscape page's printable width in CSS px is roughly 950-1050px
// (Letter/A4 minus the @page margin set in the print CSS) regardless of how
// wide Kate's own screen is — so scale to a fixed print target, not to the
// window, same idea as ocFitToWindow() but for paper instead of glass.
// Kate, 25 Sep 2026: the page is A4 landscape with a 10mm gutter (see the print
// CSS), 1047 x 718 CSS px, and the chart must fit it both ways so it prints on
// one page. A little under each for the section heading and rounding.
const OC_PRINT_TARGET_WIDTH = 1000;
const OC_PRINT_TARGET_HEIGHT = 680;

// The masthead's "Print" link. Shrinks the chart to fit one landscape page
// wide via the same --oc-scale the zoom buttons use (see the CSS comment
// above .oc-tree's @media print block for why not transform:scale), prints,
// then puts the zoom Kate was looking at back.
function ocPrint() {
  const container = document.getElementById('ocContainer');
  if (!container) { window.print(); return; }
  const zoomBefore = ocScale;
  ocApplyScale(1); // measure natural size before shrinking
  let widest = 0;
  container.querySelectorAll('.oc-tree').forEach(t => { widest = Math.max(widest, t.scrollWidth); });
  // No OC_ZOOM_MIN floor here on purpose — see ocApplyScale's comment. The
  // whole group is wide enough at scale 1 that fitting it to one landscape
  // page needs a smaller scale than the on-screen zoom-out ever allows.
  if (widest > OC_PRINT_TARGET_WIDTH) ocApplyScale(OC_PRINT_TARGET_WIDTH / widest);
  // Then the height. Gaps and headings don't all shrink with --oc-scale, so
  // measure and step down a few times rather than trusting one ratio.
  for (let i = 0; i < 6; i++) {
    const tall = container.getBoundingClientRect().height;
    if (tall <= OC_PRINT_TARGET_HEIGHT) break;
    ocApplyScale(ocScale * Math.max(0.5, OC_PRINT_TARGET_HEIGHT / tall) * 0.99);
  }

  const restore = () => { ocApplyScale(zoomBefore); removeEventListener('afterprint', restore); };
  addEventListener('afterprint', restore);
  // The photos are loading="lazy", so any box scrolled off to the side has not
  // fetched its photo yet and would print as an empty circle. Load them all
  // first (capped at 4s so a slow photo cannot hold the dialog hostage), then
  // print once the shrunk layout and redrawn connectors have painted.
  const imgs = [...container.querySelectorAll('img')];
  imgs.forEach(img => { img.loading = 'eager'; });
  const loaded = Promise.all(imgs.map(img => (img.complete && img.naturalWidth) ? null
    : new Promise(res => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); })));
  Promise.race([loaded, new Promise(res => setTimeout(res, 4000))])
    .then(() => setTimeout(() => window.print(), 50));
}

// One straight elbow line per box, from its own parent box only — no
// shared "bus" line across siblings. Coordinates are computed relative
// to the scrollable .oc-tree itself (not the viewport), so the lines
// stay put when the tree is scrolled horizontally.
// Kate, 24 Sep 2026: Ruth Bocock sits among Emma-Louise's department boxes
// (Call Centre Team, Educators, Salon Coordinators) but is a person, so her
// card belongs on the row of people under them, not level with the
// departments. A node marked dropToPhotoRow is pushed down until its top meets
// the first card under a sibling department. Measured, not a fixed margin, so
// it holds at every zoom level; runs before the lines are drawn so her
// connector is drawn to where the card ends up.
function ocAlignDrops(tree) {
  tree.querySelectorAll('li.oc-drop').forEach(li => {
    li.style.marginTop = '0px';
    const sib = [...li.parentElement.children].find(x => x !== li && x.querySelector(':scope > ul > li > .oc-node'));
    if (!sib) return;
    const target = sib.querySelector(':scope > ul > li > .oc-node').getBoundingClientRect().top;
    const mine = li.querySelector(':scope > .oc-node').getBoundingClientRect().top;
    if (target > mine) li.style.marginTop = (target - mine) + 'px';
  });
}

function drawOcConnectors(tree) {
  const old = tree.querySelector('svg.oc-lines');
  if (old) old.remove();
  ocAlignDrops(tree);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'oc-lines');
  svg.setAttribute('width', tree.scrollWidth);
  svg.setAttribute('height', tree.scrollHeight);

  const treeRect = tree.getBoundingClientRect();
  const toLocal = (r) => ({
    cx: r.left + r.width / 2 - treeRect.left + tree.scrollLeft,
    top: r.top - treeRect.top + tree.scrollTop,
    bottom: r.bottom - treeRect.top + tree.scrollTop,
  });

  tree.querySelectorAll('.oc-node').forEach(node => {
    const li = node.closest('li');
    const parentLi = li.parentElement.closest('li');
    if (!parentLi) return; // root box has no incoming line
    const parentNode = parentLi.querySelector(':scope > .oc-node');
    if (!parentNode) return;

    const c = toLocal(node.getBoundingClientRect());
    const p = toLocal(parentNode.getBoundingClientRect());
    const midY = (p.bottom + c.top) / 2;

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', `M ${p.cx} ${p.bottom} V ${midY} H ${c.cx} V ${c.top}`);
    path.setAttribute('fill', 'none');
    path.style.stroke = 'var(--border)';
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
  });

  tree.appendChild(svg);
}
