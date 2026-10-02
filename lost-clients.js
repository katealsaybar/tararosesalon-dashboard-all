// Lost Clients (Kate, 2 Oct 2026). Tara, in the coordinators' group: "we have lost
// a lot of regular clients this year … the issue is they don't book back in", and
// she wanted a list per branch for outreach. One call to lost_clients
// (migrations/create_lost_clients.sql) over sales_transaction_lines, which starts in
// January 2025, so "regular" and "gone" are judged on 2025+ visits only.
//
// Phone numbers come from client_contacts, matched from Phorest's New Clients report
// by "phorest data export/new clients/parse_new_clients.py". Only the owner login can
// read that table (Kate's choice, 2 Oct 2026), so for everyone else the server sends
// the rows without numbers and the Phone column doesn't draw. Nothing here decides
// who sees a number; the table's policy does.
//
// Level 2 and above only (Kate, 2 Oct 2026): index.html hides the menu entry and
// refuses the view for Level 1, and lost_clients itself refuses them
// (migrations/lost_clients_level2.sql).
//
// Own controls (branch, who, gone for), so the masthead filters are hidden on this
// page. Borrows the Products page's card, tile and table styles (slv-*, w13-*).
let lcRows = null, lcShowAll = false, lcQuery = '';
let lcSel = { branch: 'SAA', seg: 'regular', days: 90 };
try { Object.assign(lcSel, JSON.parse(localStorage.getItem('trs-lost') || '{}')); } catch (e) {}

const LC_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
// min/max visits per segment. Visits = days the client came in at that branch.
const LC_SEG = {
  regular: { label: 'Regulars (3+ visits)', min: 3, max: null },
  twice:   { label: 'Came twice',           min: 2, max: 2 },
  once:    { label: 'One visit only',       min: 1, max: 1 },
};
const LC_DAYS = [60, 90, 180];
const LC_LIMIT = 200;   // rows drawn before "Show all"; a branch can have 2,000+

const lcEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lcNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const lcDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function lcSave() { try { localStorage.setItem('trs-lost', JSON.stringify(lcSel)); } catch (e) {} }
function lcSet(k, v) { lcSel[k] = v; lcShowAll = false; lcSave(); renderLostClients(); }

async function renderLostClients() {
  const el = document.getElementById('lostClientsContent');
  if (!el) return;
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  el.innerHTML = lcShell('<p class="slv-muted">Loading clients…</p>');
  try {
    const { data, error } = await sb.rpc('lost_clients', {
      p_branch: lcSel.branch, p_min_visits: seg.min, p_max_visits: seg.max, p_days: Number(lcSel.days) });
    if (error || !Array.isArray(data)) throw error || new Error('no data');
    lcRows = data;
  } catch (e) {
    console.error(e);
    el.innerHTML = lcShell('<p class="slv-muted">The client list didn\'t load. Refresh to try again.</p>');
    return;
  }
  lcPaint();
}

function lcShell(body) {
  const seg = (key, opts) => `<div class="sc-seg" role="group">${opts.map(([k, l]) =>
    `<button type="button" class="${String(lcSel[key]) === String(k) ? 'on' : ''}" onclick="lcSet('${key}', ${typeof k === 'number' ? k : `'${k}'`})">${l}</button>`).join('')}</div>`;
  return `
    <section class="slv-intro">
      <h2>Lost Clients</h2>
      <p>Clients who used to come in and haven't been back, by branch, highest spend first. For reference and outreach planning.</p>
    </section>
    <div class="sc-bar w13-bar lc-bar" style="flex-wrap:wrap;gap:8px">
      ${seg('branch', Object.entries(LC_BRANCH).map(([k]) => [k, k]))}
      ${seg('seg', Object.entries(LC_SEG).map(([k, s]) => [k, s.label]))}
      ${seg('days', LC_DAYS.map(d => [d, `${d}+ days`]))}
    </div>
    <div id="lcBody">${body}</div>`;
}

function lcPaint() {
  const el = document.getElementById('lostClientsContent');
  if (!el || !lcRows) return;
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  const phones = lcRows.some(r => r.mobile || r.landline);
  const spend = lcRows.reduce((a, r) => a + (Number(r.spend) || 0), 0);
  const withNo = lcRows.filter(r => r.mobile || r.landline).length;
  const byStylist = {};
  lcRows.forEach(r => { if (r.stylist) byStylist[r.stylist] = (byStylist[r.stylist] || 0) + 1; });
  const topSt = Object.entries(byStylist).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('lcBody').innerHTML = `
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${lcEsc(LC_BRANCH[lcSel.branch])}</div><h3>${lcEsc(seg.label)}, not back in ${lcNum(lcSel.days)}+ days</h3></div>
        <p>Visits since 1 Jan 2025</p>
      </div>
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Clients</div><div class="w13-val">${lcNum(lcRows.length)}</div><div class="slv-note">haven't been back</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">What they spent</div><div class="w13-val">AED ${lcNum(spend)}</div><div class="slv-note">since Jan 2025, ex VAT</div></div>
        ${phones ? `<div class="w13-tile"><div class="slv-eyebrow">With a phone number</div><div class="w13-val">${lcNum(withNo)}</div><div class="slv-note">${lcRows.length ? Math.round(100 * withNo / lcRows.length) : 0}% of the list</div></div>` : ''}
        <div class="w13-tile"><div class="slv-eyebrow">Most of them saw</div><div class="w13-val" style="font-size:20px">${lcEsc(topSt ? topSt[0] : '–')}</div><div class="slv-note">${topSt ? lcNum(topSt[1]) + ' clients' : ''}</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 8px">
        <input type="search" id="lcSearch" placeholder="Search name or stylist" value="${lcEsc(lcQuery)}"
          oninput="lcQuery=this.value;lcShowAll=false;lcPaintTable()"
          style="flex:1;min-width:180px;max-width:320px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font:inherit">
        <button type="button" class="tglr" onclick="lcCopy()">Copy list</button>
        <span id="lcCopied" class="slv-note" style="display:inline"></span>
      </div>
      <div id="lcTable"></div>
    </section>
    <p class="slv-muted">From Phorest's Sales Transactions, which starts in January 2025: a client who was a regular in 2024 and stopped before then isn't on this list. Visits are days she came in at this branch; a client who moved to another branch shows here as gone. Usual stylist is whoever served most of her visits. "Last visit" is the newest day uploaded, so the last day or two can lag.${phones ? ' Phone numbers come from Phorest\'s New Clients report and are shown to your login only. The report doesn\'t say who opted out of marketing, so check consent in Phorest before anyone messages a client.' : ''}</p>`;
  lcPaintTable();
}

// The table on its own, so typing in the search box redraws only this and keeps
// the cursor where it is.
function lcPaintTable() {
  const box = document.getElementById('lcTable');
  if (!box || !lcRows) return;
  const q = lcQuery.trim().toLowerCase();
  const rows = q ? lcRows.filter(r => `${r.client_name} ${r.stylist || ''}`.toLowerCase().includes(q)) : lcRows;
  const phones = lcRows.some(r => r.mobile || r.landline);
  const shown = lcShowAll ? rows : rows.slice(0, LC_LIMIT);
  const check = r => r.match === 'check' ? ' <span class="slv-note" style="display:inline" title="Two different numbers under this name: two people, or one client entered twice in Phorest">check</span>' : '';
  const tr = shown.map(r => `<tr>
      <td>${lcEsc(r.client_name)}${check(r)}</td>
      <td>${lcNum(r.visits)}</td>
      <td>${lcEsc(lcDayY(r.last_visit))}<div class="slv-note">${lcNum(r.days_since)} days ago</div></td>
      <td>${lcNum(r.spend)}</td>
      <td>${lcEsc(r.stylist || '–')}</td>
      ${phones ? `<td>${lcPhone(r)}</td>` : ''}
    </tr>`).join('');
  // Under 760px the table becomes a list, like Products: name and spend on one line,
  // visits / last visit / stylist under it, the number last (tap to call).
  const cards = shown.map(r => `<li class="prd-card">
      <div class="prd-body">
        <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${check(r)}</span><span class="prd-spend">AED ${lcNum(r.spend)}</span></div>
        <div class="prd-meta">${lcNum(r.visits)} visits · last ${lcEsc(lcDayY(r.last_visit))} (${lcNum(r.days_since)} days)${r.stylist ? ' · ' + lcEsc(r.stylist) : ''}</div>
        ${phones && (r.mobile || r.landline) ? `<div class="prd-meta" style="margin-top:4px">${lcPhone(r)}</div>` : ''}
      </div>
    </li>`).join('');
  box.innerHTML = rows.length ? `<div class="slv-wrap prd-desk"><table class="slv-table">
      <thead><tr><th>Client</th><th>Visits</th><th>Last visit</th><th>Spend (AED)</th><th>Usual stylist</th>${phones ? '<th>Phone</th>' : ''}</tr></thead>
      <tbody>${tr}</tbody></table></div>
      <ol class="prd-cards">${cards}</ol>
      ${rows.length > shown.length ? `<p style="margin-top:10px"><button type="button" class="tglr" onclick="lcShowAll=true;lcPaintTable()">Show all ${lcNum(rows.length)}</button></p>` : ''}`
    : `<p class="slv-muted">${q ? 'No one on this list matches that search.' : 'No clients on this list.'}</p>`;
}

// One number per client on screen. A common name can carry up to ten (everyone in
// Phorest with that name), which stretched the column off the card; the rest sit
// behind "+N more" on hover, and Copy list still carries them all.
function lcPhone(r) {
  const nums = String(r.mobile || r.landline || '').split(' / ').filter(Boolean);
  if (!nums.length) return '–';
  const first = `<a href="tel:${lcEsc(nums[0])}" style="color:inherit;white-space:nowrap">${lcEsc(nums[0])}</a>`;
  return nums.length > 1
    ? `${first} <span class="slv-note" style="display:inline" title="${lcEsc(nums.slice(1).join(', '))}">+${nums.length - 1} more</span>`
    : first;
}

// Tab-separated, so it pastes into a sheet as columns. Copies the list as searched,
// all of it, not just the rows drawn.
function lcCopy() {
  const q = lcQuery.trim().toLowerCase();
  const rows = (lcRows || []).filter(r => !q || `${r.client_name} ${r.stylist || ''}`.toLowerCase().includes(q));
  const phones = (lcRows || []).some(r => r.mobile || r.landline);
  const head = ['Client', 'Visits', 'Last visit', 'Days since', 'Spend (AED)', 'Usual stylist'].concat(phones ? ['Phone'] : []);
  const lines = [head].concat(rows.map(r => [r.client_name, r.visits, r.last_visit, r.days_since, Math.round(Number(r.spend) || 0),
    r.stylist || ''].concat(phones ? [r.mobile || r.landline || ''] : [])));
  const text = lines.map(l => l.join('\t')).join('\n');
  const done = () => { const s = document.getElementById('lcCopied'); if (s) s.textContent = `Copied ${lcNum(rows.length)} rows`; };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
}
