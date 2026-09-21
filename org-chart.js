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
      children: [
        { name: 'Daisy Charlotte Cropper', role: 'Managing Director, Tara Rose Bahrain' },
        { name: 'Mette Haxthausen', role: 'Executive Partner (Salon Consultant)' },
        {
          name: 'Core Team',
          role: 'Department',
          children: [
            { name: 'Emma-Louise Usher', role: 'General Manager — see Salon Operations Team below' },
            { name: 'Kate Alsaybar', role: 'Operations and Performance Manager, EA' },
            { name: 'Hanneh Rose Rejas', role: 'Social Media Manager' },
          ],
        },
        {
          name: 'Accounts & Admin Department',
          role: 'Department',
          children: [
            {
              name: 'Jumera Chavenia',
              role: 'Accounts and Admin Head',
              children: [
                {
                  name: 'Mary Ann Yanson',
                  role: 'Accounts Manager',
                  children: [
                    { name: 'Suncirie Pedrosa', role: 'Accounts Officer' },
                  ],
                },
                { name: 'Jeanylyn Pacada', role: 'HR & Admin Officer' },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: 'salon-ops',
    label: 'Salon Operations Team',
    colour: '#99F6E4',
    root: {
      name: 'Emma-Louise Usher',
      role: 'General Manager',
      children: [
        {
          name: 'Call Centre Team',
          role: 'Department',
          children: [
            {
              name: 'Christabelle Bustos',
              role: 'Call Centre Team Lead',
              children: [
                { name: 'Hazel Alcala', role: 'Call Centre Receptionist' },
              ],
            },
          ],
        },
        {
          name: 'Educators',
          role: 'Department',
          children: [
            { name: 'Emma Williamson', role: 'Treatments & Retail Educator' },
            { name: 'Ashleigh Fairgrieve', role: 'Blondes & Extensions Educator' },
          ],
        },
        { name: 'Ruth Bocock', role: 'Salon Manager, Al Quoz Branch' },
        {
          name: 'Salon Coordinators',
          role: 'Department',
          children: [
            { name: 'Jhoana Cairel', role: 'Salon Coordinator, Khalifa City Branch' },
            { name: 'Cristine Bracamonte', role: 'Salon Coordinator, Saadiyat Branch' },
            { name: 'Frances Pia Sergio', role: 'Salon Coordinator, Al Quoz Branch' },
            { name: 'Shiela Avena', role: 'Salon Coordinator, Motor City Branch' },
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
  return `
    <li>
      <div class="oc-node${isHead ? ' is-head' : ''}">
        <div class="oc-name">${escapeHtml(node.name)}</div>
        <div class="oc-role">${escapeHtml(node.role || '')}</div>
      </div>
      ${children}
    </li>`;
}

function renderOrgChart() {
  const host = document.getElementById('orgChartContent');
  if (!host) return;
  if (typeof ORG_CHART === 'undefined' || !ORG_CHART.length) {
    host.innerHTML = `<div class="loading">No teams added yet.</div>`;
    return;
  }
  host.innerHTML = ORG_CHART.map(team => `
    <div class="oc-section">
      <div class="section-label" style="display:flex;align-items:center;gap:7px;margin-bottom:14px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                     background:${team.colour};flex-shrink:0"></span>
        ${escapeHtml(team.label)}
      </div>
      <ul class="oc-tree">${ocNode(team.root, true)}</ul>
    </div>
  `).join('');
}
