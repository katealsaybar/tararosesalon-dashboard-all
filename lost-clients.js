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
// Clients seen at another branch inside the same window (now_at, from
// migrations/lost_clients_moved.sql) switched salons rather than left: about 8% of
// the list when Kate checked it. They are off the list and the tiles, on a line of
// their own with a "Show them" switch.
//
// Own controls (branch, who, gone for), so the masthead filters are hidden on this
// page. Borrows the Products page's card, tile and table styles (slv-*, w13-*).
let lcAll = null, lcRows = null, lcShowAll = false, lcQuery = '', lcMovedView = false;
let lcSel = { branch: 'SAA', seg: 'regular', days: 90 };
try { Object.assign(lcSel, JSON.parse(localStorage.getItem('trs-lost') || '{}')); } catch (e) {}

const LC_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
// min/max visits per segment. Visits = days the client came in at that branch.
const LC_SEG = {
  regular: { label: 'Regulars (3+ visits)', short: '3+', min: 3, max: null },
  twice:   { label: 'Came twice',           short: '2',  min: 2, max: 2 },
  once:    { label: 'One visit only',       short: '1',  min: 1, max: 1 },
};
const LC_DAYS = [60, 90, 180];
const LC_LIMIT = 200;   // rows drawn before "Show all"; a branch can have 2,000+

const lcEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lcNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const lcDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function lcSave() { try { localStorage.setItem('trs-lost', JSON.stringify(lcSel)); } catch (e) {} }
function lcSet(k, v) { lcSel[k] = v; lcShowAll = false; lcMovedView = false; lcSave(); renderLostClients(); }
function lcToggleMoved() { lcMovedView = !lcMovedView; lcShowAll = false; lcPaint(); }

async function renderLostClients() {
  const el = document.getElementById('lostClientsContent');
  if (!el) return;
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  el.innerHTML = lcShell('<p class="slv-muted">Loading clients…</p>');
  try {
    const { data, error } = await sb.rpc('lost_clients', {
      p_branch: lcSel.branch, p_min_visits: seg.min, p_max_visits: seg.max, p_days: Number(lcSel.days) });
    if (error || !Array.isArray(data)) throw error || new Error('no data');
    lcAll = data;
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
    <div class="sc-bar w13-bar lc-bar">
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Branch</div>${seg('branch', Object.entries(LC_BRANCH).map(([k]) => [k, k]))}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Visits</div>${seg('seg', Object.entries(LC_SEG).map(([k, s]) => [k, s.short]))}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Days away</div>${seg('days', LC_DAYS.map(d => [d, `${d}+`]))}</div>
    </div>
    <div id="lcBody">${body}</div>`;
}

function lcPaint() {
  const el = document.getElementById('lostClientsContent');
  if (!el || !lcAll) return;
  const seg = LC_SEG[lcSel.seg] || LC_SEG.regular;
  const lost = lcAll.filter(r => !r.now_at), moved = lcAll.filter(r => r.now_at);
  if (!moved.length) lcMovedView = false;
  lcRows = lcMovedView ? moved : lost;
  const phones = lcAll.some(r => r.mobile || r.landline);
  const spend = lost.reduce((a, r) => a + (Number(r.spend) || 0), 0);
  const withNo = lost.filter(r => r.mobile || r.landline).length;
  const byStylist = {};
  lost.forEach(r => { if (r.stylist) byStylist[r.stylist] = (byStylist[r.stylist] || 0) + 1; });
  const topSt = Object.entries(byStylist).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('lcBody').innerHTML = `
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${lcEsc(LC_BRANCH[lcSel.branch])}</div><h3>${lcEsc(seg.label)}, not back in ${lcNum(lcSel.days)}+ days</h3></div>
        <p>Visits since 1 Jan 2025</p>
      </div>
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Clients</div><div class="w13-val">${lcNum(lost.length)}</div><div class="slv-note">haven't been back</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">What they spent</div><div class="w13-val">AED ${lcNum(spend)}</div><div class="slv-note">since Jan 2025, ex VAT</div></div>
        ${phones ? `<div class="w13-tile"><div class="slv-eyebrow">With a phone number</div><div class="w13-val">${lcNum(withNo)}</div><div class="slv-note">${lost.length ? Math.round(100 * withNo / lost.length) : 0}% of the list</div></div>` : ''}
        <div class="w13-tile"><div class="slv-eyebrow">Most of them saw</div><div class="w13-val" style="font-size:20px">${lcEsc(topSt ? topSt[0] : '–')}</div><div class="slv-note">${topSt ? lcNum(topSt[1]) + ' clients' : ''}</div></div>
      </div>
      ${moved.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 0">
        <span class="slv-muted" style="margin:0">${lcMovedView
          ? `Showing the ${lcNum(moved.length)} who came back at another branch instead. They aren't counted above.`
          : `${lcNum(moved.length)} more came back at another branch in the last ${lcNum(lcSel.days)} days, so they aren't counted as lost.`}</span>
        <button type="button" class="tglr" onclick="lcToggleMoved()">${lcMovedView ? 'Back to the lost list' : 'Show them'}</button>
      </div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 8px">
        <input type="search" id="lcSearch" placeholder="Search name or stylist" value="${lcEsc(lcQuery)}"
          oninput="lcQuery=this.value;lcShowAll=false;lcPaintTable()"
          style="flex:1;min-width:180px;max-width:320px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;font:inherit">
        <button type="button" class="tglr" onclick="lcSaveFile('xlsx')">XLSX</button>
        <button type="button" class="tglr" onclick="lcSaveFile('csv')">CSV</button>
        <span id="lcCopied" class="slv-note" style="display:inline"></span>
      </div>
      <div id="lcTable"></div>
    </section>
    <p class="slv-muted">From Phorest's Sales Transactions, which starts in January 2025: a client who was a regular in 2024 and stopped before then isn't on this list. Visits are days she came in at this branch; a client seen at another branch in the same window is counted on its own line, not as lost. Usual stylist is whoever served most of her visits. "Last visit" is the newest day uploaded, so the last day or two can lag.${phones ? ' Phone numbers come from Phorest\'s New Clients report and are shown to your login only. The report doesn\'t say who opted out of marketing, so check consent in Phorest before anyone messages a client.' : ''}</p>`;
  lcPaintTable();
  lcStickHead();
}

// The column heads stay put under the filter bar while the list scrolls (Kate, 2 Oct
// 2026). The bar is itself sticky and wraps to two rows on a narrow window, so its
// height is measured rather than typed into the CSS.
function lcStickHead() {
  const bar = document.querySelector('#lostClientsContent .lc-bar');
  if (bar) document.documentElement.style.setProperty('--lc-bar-h', bar.offsetHeight + 'px');
}
window.addEventListener('resize', lcStickHead);

// The table on its own, so typing in the search box redraws only this and keeps
// the cursor where it is.
function lcPaintTable() {
  const box = document.getElementById('lcTable');
  if (!box || !lcRows) return;
  const nowAt = r => lcMovedView && r.now_at ? `${lcEsc(r.now_at)}<div class="slv-note">${lcEsc(lcDayY(r.now_last))}</div>` : '';
  const q = lcQuery.trim().toLowerCase();
  const rows = q ? lcRows.filter(r => `${r.client_name} ${r.stylist || ''}`.toLowerCase().includes(q)) : lcRows;
  const phones = lcAll.some(r => r.mobile || r.landline);
  const shown = lcShowAll ? rows : rows.slice(0, LC_LIMIT);
  const check = r => r.match === 'check' ? ' <span class="slv-note" style="display:inline" title="Two different numbers under this name: two people, or one client entered twice in Phorest">check</span>' : '';
  const tr = shown.map(r => `<tr>
      <td>${lcEsc(r.client_name)}${check(r)}</td>
      <td>${lcNum(r.visits)}</td>
      <td>${lcEsc(lcDayY(r.last_visit))}<div class="slv-note">${lcNum(r.days_since)} days ago</div></td>
      <td>${lcNum(r.spend)}</td>
      <td>${lcStylist(r.stylist)}</td>
      ${lcMovedView ? `<td>${nowAt(r)}</td>` : ''}
      ${phones ? `<td>${lcPhone(r)}</td>` : ''}
    </tr>`).join('');
  // Under 760px the table becomes a list, like Products: name and spend on one line,
  // visits / last visit / stylist under it, the number last (tap to call).
  const cards = shown.map(r => `<li class="prd-card">
      <div class="prd-body">
        <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${check(r)}</span><span class="prd-spend">AED ${lcNum(r.spend)}</span></div>
        <div class="prd-meta">${lcNum(r.visits)} visits · last ${lcEsc(lcDayY(r.last_visit))} (${lcNum(r.days_since)} days)${r.stylist ? ' · ' + lcStylist(r.stylist) : ''}${lcMovedView && r.now_at ? ' · now at ' + lcEsc(r.now_at) + ' (' + lcEsc(lcDayY(r.now_last)) + ')' : ''}</div>
        ${phones && (r.mobile || r.landline) ? `<div class="prd-meta" style="margin-top:4px">${lcPhone(r)}</div>` : ''}
      </div>
    </li>`).join('');
  box.innerHTML = rows.length ? `<div class="slv-wrap prd-desk lc-wrap"><table class="slv-table">
      <thead><tr><th>Client</th><th>Visits</th><th>Last visit</th><th>Spend (AED)</th><th>Usual stylist</th>${lcMovedView ? '<th>Now at</th>' : ''}${phones ? '<th>Phone</th>' : ''}</tr></thead>
      <tbody>${tr}</tbody></table></div>
      <ol class="prd-cards">${cards}</ol>
      ${rows.length > shown.length ? `<p style="margin-top:10px"><button type="button" class="tglr" onclick="lcShowAll=true;lcPaintTable()">Show all ${lcNum(rows.length)}</button></p>` : ''}`
    : `<p class="slv-muted">${q ? 'No one on this list matches that search.' : 'No clients on this list.'}</p>`;
}

// Usual stylist as a link (Kate, 2 Oct 2026): the same hover / tap menu every other
// staff name has (staff-links.js: Staff card, Staff stats, Branch figures), in the
// hair or beauty accent by her role in staff-profiles.js. Hair when unknown.
function lcStylist(name) {
  if (!name) return '–';
  const up = String(name).trim().toUpperCase(), w = up.split(/\s+/);
  const prof = (typeof STAFF_PROFILES !== 'undefined')
    ? (STAFF_PROFILES[up] || STAFF_PROFILES[w.slice(0, 2).join(' ')] || STAFF_PROFILES[w[0]]) : null;
  const dept = prof && /beauty|nail|lash|brow|therap|aesthet/i.test(prof.role || '') ? 'beauty' : 'hair';
  const inner = `<span class="lc-st lc-st-${dept}">${lcEsc(name)}</span>`;
  return typeof staffWho === 'function' ? staffWho(name, inner, { dept, branch: lcSel.branch }) : inner;
}

// One number per client on screen. A common name can carry up to ten (everyone in
// Phorest with that name), which stretched the column off the card. The rest sit
// behind "+N more", a button (Kate, 2 Oct 2026: it was only a hover title, so it
// could not be clicked); it opens them under the first, each one tap-to-call. The
// files carry them all.
function lcPhone(r) {
  const nums = String(r.mobile || r.landline || '').split(' / ').filter(Boolean);
  if (!nums.length) return '–';
  const tel = n => `<a href="tel:${lcEsc(n)}" style="color:inherit;white-space:nowrap">${lcEsc(n)}</a>`;
  return nums.length > 1
    ? `<span class="lc-ph">${tel(nums[0])} <button type="button" class="lc-more" aria-expanded="false"
        onclick="const p=this.parentNode,o=p.classList.toggle('open');this.setAttribute('aria-expanded',o);this.textContent=o?'fewer':'+${nums.length - 1} more'">+${nums.length - 1} more</button>
        <span class="lc-rest">${nums.slice(1).map(tel).join('<br>')}</span></span>`
    : tel(nums[0]);
}

// The list as searched, all of it, not just the rows drawn: the header and one array
// per client. XLSX and CSV both read this, so the two never disagree. (Copy list went
// the same day: a list of 1,300 clients is a file, not a paste.)
function lcExportLines() {
  const q = lcQuery.trim().toLowerCase();
  const rows = (lcRows || []).filter(r => !q || `${r.client_name} ${r.stylist || ''}`.toLowerCase().includes(q));
  const phones = (lcAll || []).some(r => r.mobile || r.landline);
  const head = ['Client', 'Visits', 'Last visit', 'Days since', 'Spend (AED)', 'Usual stylist']
    .concat(lcMovedView ? ['Now at', 'Last visit there'] : []).concat(phones ? ['Phone'] : []);
  const lines = rows.map(r => [r.client_name, Number(r.visits) || 0, r.last_visit, Number(r.days_since) || 0, Math.round(Number(r.spend) || 0),
    r.stylist || ''].concat(lcMovedView ? [r.now_at || '', r.now_last || ''] : []).concat(phones ? [r.mobile || r.landline || ''] : []));
  return { head, lines, rows };
}

// XLSX and CSV (Kate, 2 Oct 2026), written by ledger-export.js's own writer (no
// library). Header row first, no title rows, so the file imports straight into a
// sheet or a CRM. File name: lost-clients-SAA-regulars-60d (plus -moved / -search).
function lcSaveFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const { head, lines } = lcExportLines();
  const nums = new Set(['Visits', 'Days since', 'Spend (AED)']);
  const cols = head.map(h => ({ label: h, fmt: h === 'Spend (AED)' ? 'aed' : nums.has(h) ? 'num' : 'text' }));
  const built = lgxBuild({ sheets: [{ name: 'Lost clients ' + lcSel.branch, blocks: [{ cols, rows: lines.map(l => ({ cells: l })) }] }] });
  const name = ['lost-clients', lcSel.branch, lcSel.seg === 'regular' ? 'regulars' : lcSel.seg, lcSel.days + 'd']
    .concat(lcMovedView ? ['moved'] : []).concat(lcQuery.trim() ? ['search'] : []).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  const s = document.getElementById('lcCopied');
  if (s) s.textContent = `Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`;
}
