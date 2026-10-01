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
  social_feed: 'Posts tagging @tararosesalon plus salon posts she is a collaborator on, each post once.',
  // Interim until Tara defines it (Kate, 28 Sep 2026), same as the stylist page.
  social_workdays: 'Days worked with a post, a collab on a salon post, or a story mention of the salon.',
};
let slvData = null;
let slvPick = null;

// ── AT THIS LEVEL (Kate, 1 Oct 2026, Comet SL1) ─────────────────────────
// The guide said what a level asks for; it never said who on the team is there.
// Under the table: each stylist at the picked level, one row, her month's actuals
// against her own level, from perf_team (the same numbers as her My Numbers page).
// A cell is red under the minimum, amber between minimum and aim, green at the aim.
// The last column counts how many of the next level's aims she already hits.
// Totals follow days worked, as on My Numbers: a first month or 4+ days of leave
// (perf_leave) cuts the month's summed minimums and aims to the days she was in.
// Only complete months are offered, so nothing needs pacing.
const SLV_ACT = [
  ['total_revenue', 'Revenue', 'aed'], ['clients', 'Clients', 'num'], ['avg_bill', 'Avg bill', 'aed'],
  ['treatments_pct', 'Treat %', 'pct'], ['retail_pct', 'Retail %', 'pct'], ['rebooking_pct', 'Rebook %', 'pct'],
];
const SLV_SUM = new Set(['total_revenue', 'hair_services', 'treatments', 'retail', 'clients', 'ncr',
  'google_reviews', 'social_feed', 'social_workdays']);
let slvTeam = null, slvTeamMonth = null;
// The month offered by default: the last complete one.
const slvMonths = () => {
  const out = [], d = new Date(); d.setDate(1);
  for (let i = 1; i <= 6; i++) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`); }
  return out;
};
let slvMonth = null;
try { slvMonth = localStorage.getItem('slv-month'); } catch (e) {}
if (!slvMonths().includes(slvMonth)) slvMonth = slvMonths()[0];
const slvMonthLabel = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
async function slvLoadTeam() {
  if (slvTeam && slvTeamMonth === slvMonth) return slvTeam;
  const { data, error } = await sb.rpc('perf_team', { p_admin: typeof spfGet === 'function' ? spfGet() : null, p_month: slvMonth + '-01' });
  if (error || !data) return null;
  slvTeam = data; slvTeamMonth = slvMonth;
  return data;
}
// Share of the month she worked: first month from her start day, less leave days.
function slvShare(n, month) {
  const m1 = new Date(month + '-01T00:00:00'), days = new Date(m1.getFullYear(), m1.getMonth() + 1, 0).getDate();
  const sd = n.start_date ? new Date(n.start_date + 'T00:00:00') : null;
  const startLeft = (sd && sd.getFullYear() === m1.getFullYear() && sd.getMonth() === m1.getMonth() && sd.getDate() > 1) ? days - sd.getDate() + 1 : days;
  const left = startLeft - (n.leave_days || 0);
  return left > 0 && left < days ? left / days : (left <= 0 ? null : 1);
}
const slvCut = (v, k, f, share) => (v === null || v === undefined || !SLV_SUM.has(k) || !share || share === 1) ? v
  : f === 'aed' ? Math.round(v * share / 100) * 100 : Math.max(v > 0 ? 1 : 0, Math.round(v * share));
function slvAtLevel(cur, next) {
  if (!slvTeam) return '<p class="slv-muted">Loading the team…</p>';
  const people = (slvTeam.staff || []).filter(s => s.level === cur.level);
  const cols = SLV_ACT.filter(([k]) => cur.kpis[k]);
  const pick = `<span class="spf-dd"><select id="slvMonth" aria-label="Month" onchange="slvSetMonth(this.value)">
    ${slvMonths().map(m => `<option value="${m}"${m === slvMonth ? ' selected' : ''}>${slvMonthLabel(m)}</option>`).join('')}</select></span>`;
  const head = `<div class="slv-head"><div><div class="slv-eyebrow">At this level</div><h3>${slvEsc(cur.level)}s in ${slvEsc(slvMonthLabel(slvMonth))}</h3></div>${pick}</div>`;
  if (!people.length) return head + `<p class="slv-muted">Nobody is set at this level${cur.level ? '' : ' yet'}.</p>`;
  const nextKeys = next ? Object.keys(next.kpis).filter(k => next.kpis[k] && next.kpis[k].target != null) : [];
  const rows = people.map(s => {
    const n = s.numbers || {}, share = slvShare(n, slvMonth);
    const cells = cols.map(([k, , f]) => {
      const v = n[k], b = cur.kpis[k];
      if (v === null || v === undefined) return '<td>–</td>';
      const min = slvCut(b.min, k, f, share), aim = slvCut(b.target, k, f, share);
      const cls = aim != null && v >= aim ? 'slv-a-good' : min != null && v < min ? 'slv-a-bad' : 'slv-a-mid';
      return `<td class="${cls}" title="Minimum ${slvFmt(min, f)} · aim ${slvFmt(aim, f)}">${slvFmt(v, f)}</td>`;
    }).join('');
    let hit = 0, of = 0;
    nextKeys.forEach(k => { const v = n[k]; if (v === null || v === undefined) return; of++;
      const f = (SLV_GROUPS.flatMap(g => g[1]).find(x => x[0] === k) || [, , 'num'])[2];
      if (v >= slvCut(next.kpis[k].target, k, f, share)) hit++; });
    const away = share !== null && share < 1 ? ` <span class="slv-note" style="display:inline">· aims cut to ${Math.round(share * 100)}% of the month</span>` : '';
    return `<tr><td>${slvEsc(s.name)}<div class="slv-note">${slvEsc((typeof BRANCH_INFO !== 'undefined' && BRANCH_INFO[s.branch] && BRANCH_INFO[s.branch].name) || s.branch)}${away}</div></td>${cells}${next ? `<td class="slv-next">${of ? `${hit} of ${of}` : '–'}</td>` : ''}</tr>`;
  }).join('');
  return head + `<div class="slv-wrap"><table class="slv-table">
      <thead><tr><th>Stylist</th>${cols.map(([, l]) => `<th>${slvEsc(l)}</th>`).join('')}${next ? `<th>${slvEsc(next.level)} aims hit</th>` : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="slv-muted">Her month's actuals against this level: red under the minimum, amber between minimum and aim, green at the aim (point at a figure for both). Totals are cut to the days she worked in a first month or after 4+ days of leave, as on her own page.${next ? ` The last column counts the ${slvEsc(next.level)} aims she already reaches.` : ''}</p>`;
}
function slvSetMonth(m) {
  slvMonth = m;
  try { localStorage.setItem('slv-month', m); } catch (e) {}
  renderStylistLevels();
}
try { slvPick = localStorage.getItem('slv-level'); } catch (e) {}

function slvFmt(v, f) {
  if (v === null || v === undefined || v === '') return '–';
  const n = Number(v);
  if (f === 'aed') return 'AED ' + n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  if (f === 'pct') return n + '%';
  if (f === 'rep') return n.toFixed(1) + '★';   // stars, as on the stylist page
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
    <div class="slv-top" id="slvTop">
    <section class="slv-intro">
      <h2>How you move up.</h2>
      <p>Every level has a minimum that holds it and an aim to work towards. To move on to the next level, reach that level's aims. Pick a level to see the numbers.</p>
    </section>
    <div class="slv-ladder" role="tablist" aria-label="Level">
      ${levels.map((l, j) => `<button type="button" role="tab" aria-selected="${j === i}" class="${j === i ? 'on' : ''}" onclick="slvSet('${slvEsc(l.level)}')"><span class="slv-step">${j + 1}</span>${slvEsc(l.level)}</button>`).join('')}
    </div>
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
    </section>
    <section class="slv-card slv-at" id="slvAt">${slvAtLevel(cur, next)}</section>`;
  // On a phone the pills are one swipeable row: keep the chosen level in view.
  const on = el.querySelector('.slv-ladder .on');
  if (on && on.parentNode.scrollWidth > on.parentNode.clientWidth) on.parentNode.scrollLeft = on.offsetLeft - 16;
  slvStuck();
  // The team's month loads after the guide is up, so the levels never wait on it.
  if (!slvTeam || slvTeamMonth !== slvMonth) {
    const got = await slvLoadTeam();
    const box = document.getElementById('slvAt');
    if (box) box.innerHTML = got ? slvAtLevel(cur, next) : '<p class="slv-muted">The team\'s numbers didn\'t load. Refresh to try again.</p>';
  }
  if (typeof spfDD === 'function') spfDD(document.getElementById('slvMonth'));
}
// Kate, 28 Sep 2026: the intro and the level pills stay under the header while the
// table scrolls; once parked they condense (the paragraph folds away) so the table
// keeps the screen, which matters most on a phone.
function slvStuck() {
  const top = document.getElementById('slvTop');
  if (!top || top.offsetParent === null) return;
  const park = parseFloat(getComputedStyle(top).top) || 0;
  top.classList.toggle('stuck', window.scrollY > 0 && top.getBoundingClientRect().top <= park + 1);
}
window.addEventListener('scroll', slvStuck, { passive: true });
function slvSet(level) {
  slvPick = level;
  try { localStorage.setItem('slv-level', level); } catch (e) {}
  renderStylistLevels();
}
