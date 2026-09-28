// Stylist Levels (Kate, 28 Sep 2026): the guide under Staff Benchmarks. One level at a
// time: what holds it (the minimum), its aim, and the aims of the next level up, which
// are what a stylist has to reach before moving on. Every number comes from
// perf_benchmarks through perf_levels (migrations/create_performance.sql), so it can
// never disagree with the Staff Benchmarks pages. Labels match performance.js's KPIS.
const SLV_GROUPS = [
  ['Sales', [
    ['total_revenue', 'Total revenue', 'aed'], ['hair_services', 'Hair services', 'aed'],
    ['treatments', 'Treatments', 'aed'], ['treatments_pct', 'Treatments %', 'pct'],
    ['retail', 'Retail', 'aed'], ['retail_pct', 'Retail %', 'pct'], ['avg_bill', 'Average bill', 'aed'],
  ]],
  ['Clients', [
    ['clients', 'Client numbers', 'num'], ['ncr', 'New client requests', 'num'],
    ['request_pct', 'Request rate %', 'pct'], ['rebooking_pct', 'Rebooking %', 'pct'],
    ['retention_pct', 'Retention %', 'pct'], ['conversion_pct', 'Conversion %', 'pct'],
    ['column_fill_pct', 'Column fill %', 'pct'], ['colour_pct', 'Colour %', 'pct'],
  ]],
  ['Reputation and socials', [
    ['reputation', 'Reputation score', 'rep'], ['google_reviews', 'Google reviews', 'num'],
    ['social_feed', 'Social posts (feed)', 'num'], ['social_workdays', 'Social posts (workdays)', 'num'],
  ]],
];
const SLV_NOTES = {
  reputation: 'Average Google stars over the last 90 days, from 3 reviews.',
  social_workdays: 'Not tracked yet.',
};
let slvData = null;
let slvPick = null;
try { slvPick = localStorage.getItem('slv-level'); } catch (e) {}

function slvFmt(v, f) {
  if (v === null || v === undefined || v === '') return '–';
  const n = Number(v);
  if (f === 'aed') return 'AED ' + n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  if (f === 'pct') return n + '%';
  if (f === 'rep') return n.toFixed(1) + '/5';
  return n.toLocaleString('en-GB');
}
const slvEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function renderStylistLevels() {
  const el = document.getElementById('stylistLevelsContent');
  if (!slvData) {
    el.innerHTML = '<p class="slv-muted">Loading the levels…</p>';
    const { data, error } = await sb.rpc('perf_levels', { p_admin: typeof spfGet === 'function' ? spfGet() : null });
    if (error || !data) { el.innerHTML = '<p class="slv-muted">The levels didn\'t load. Refresh to try again.</p>'; return; }
    slvData = data;
  }
  const levels = slvData;
  const i = Math.max(0, levels.findIndex(l => l.level === slvPick));
  const cur = levels[i], next = levels[i + 1];
  const cell = (b, f) => slvFmt(b && b.target, f);
  const rows = SLV_GROUPS.map(([g, list]) => {
    const body = list.filter(([k]) => cur.kpis[k] || (next && next.kpis[k])).map(([k, label, f]) => {
      const b = cur.kpis[k], nb = next && next.kpis[k];
      const note = SLV_NOTES[k] ? `<div class="slv-note">${slvEsc(SLV_NOTES[k])}</div>` : '';
      return `<tr><td>${slvEsc(label)}${note}</td><td>${slvFmt(b && b.min, f)}</td><td class="slv-aim">${cell(b, f)}</td>${next ? `<td class="slv-next">${cell(nb, f)}</td>` : ''}</tr>`;
    }).join('');
    return body ? `<tr class="slv-g"><th colspan="${next ? 4 : 3}">${slvEsc(g)}</th></tr>${body}` : '';
  }).join('');

  el.innerHTML = `
    <div class="sc-bar"><span class="sc-bar-t">Stylist Levels</span></div>
    <section class="slv-intro">
      <h2>How you move up.</h2>
      <p>Every level has a minimum that holds it and an aim to work towards. To move on to the next level, reach that level's aims. Pick a level to see the numbers.</p>
    </section>
    <div class="slv-ladder" role="tablist" aria-label="Level">
      ${levels.map((l, j) => `<button type="button" role="tab" aria-selected="${j === i}" class="${j === i ? 'on' : ''}" onclick="slvSet('${slvEsc(l.level)}')"><span class="slv-step">${j + 1}</span>${slvEsc(l.level)}</button>`).join('')}
    </div>
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">Level ${i + 1} of ${levels.length}</div><h3>${slvEsc(cur.level)}</h3></div>
        <p>${next ? `To move up to <strong>${slvEsc(next.level)}</strong>, reach the numbers in the last column.` : 'The top of the ladder. Hold these aims month after month.'}</p>
      </div>
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Measure</th><th>Minimum</th><th>Aim</th>${next ? `<th>To reach ${slvEsc(next.level)}</th>` : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="slv-muted">Monthly numbers. A dash means it isn't set for that level. Beauty levels are still being set with Tara.</p>
    </section>`;
}
function slvSet(level) {
  slvPick = level;
  try { localStorage.setItem('slv-level', level); } catch (e) {}
  renderStylistLevels();
}
