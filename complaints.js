// Client Complaints (Kate, 22 Oct 2026): the historical map of client complaints, per branch, per year, by kind and by
// how each one was resolved. Built from the notes staff typed into Phorest (client card and visit notes), copied on
// 21 Oct 2026 for the Zenoti move, then read and sorted one by one. A snapshot, not live.
//
// Two calls (migrations/client_complaints.sql), both Level 5 only and both read only:
//   client_complaints_summary   everything on the page above the list: tiles, branch table, years, kinds, outcomes
//   client_complaints_list      a page of the complaints themselves, with the original note
// The table behind them is owner_read only and the functions refuse anyone under Level 5, because the dashboard's
// table policies check membership, not level. Nothing here is stored in the browser except the branch pick: no
// names or notes ever go into localStorage.
//
// Own controls (branch, filters), so the masthead filters are hidden here, as on Client Mix and the Client Book.
// What it cannot show: complaints nobody wrote down, WhatsApp complaints, and Google reviews (that is its own page).
const CQ_STORE = 'trs-client-complaints';
const CQ = { branch: 'all', src: 'visit', type: 'all', res: 'all', q: '', low: false, page: 0 };
try {
  const s = JSON.parse(localStorage.getItem(CQ_STORE) || '{}');
  if (typeof s.branch === 'string') CQ.branch = s.branch;
} catch (e) {}
const cqSave = () => { try { localStorage.setItem(CQ_STORE, JSON.stringify({ branch: CQ.branch })); } catch (e) {} };
let cqSum = null, cqList = null, cqSeqS = 0, cqSeqL = 0, cqTimer = 0, cqOpen = 0;
const CQ_PAGE = 30;
const CQ_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', MRY: 'Marasy', FRA: 'Fratelli', BAH: 'Bahrain' };
const CQ_TOGGLE = [['all', 'All branches'], ['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'],
  ['MRY', 'Marasy (closed)'], ['BAH', 'Bahrain']];
const CQ_COLOUR = { SAA: '#b4637a', KCA: '#3e7f8f', MC: '#c8923a', AQ: '#6f8f4e', MRY: '#8a7aa6', FRA: '#999', BAH: '#c06a3a' };
const CQ_TYPE = {
  colour_result: 'Colour result', nail_service: 'Nail service', treatment_result: 'Treatment result', cut_result: 'Cut result',
  price_or_billing: 'Price or billing', repeat_complainer: 'Repeat complainer', booking_or_admin: 'Booking or admin',
  wait_or_time: 'Wait or time', staff_attitude: 'Staff attitude', skin_reaction_or_injury: 'Skin reaction or injury',
  facility_or_parking: 'Facility or parking', product: 'Product', other: 'Other', unclear: 'Unclear'
};
const CQ_RES = {
  free_redo: 'Free redo', refund: 'Refund', discount_or_credit: 'Discount or credit', free_service_or_product: 'Free service or product',
  adjusted_same_visit: 'Fixed during the visit', apology_or_explanation: 'Talked through', escalated_followup: 'Escalated, follow-up',
  client_lost_or_cancelled: 'Client cancelled or left', no_action_noted: 'No outcome written', unclear: 'Unclear'
};

const cqEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cqNum = n => Number(n || 0).toLocaleString('en-GB');
const cqPct = (n, t) => t ? Math.round(100 * n / t) + '%' : '0%';
const cqText = s => cqEsc(s).replace(/\r?\n/g, '<br>');
const cqDay = iso => {
  if (!iso) return 'Client card';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const cqBr = c => CQ_BRANCH[c] || c || 'Not matched';
const cqLevelOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 5;

function cqShell() {
  const bopts = CQ_TOGGLE.map(([k, l]) => `<option value="${k}"${CQ.branch === k ? ' selected' : ''}>${cqEsc(l)}</option>`).join('');
  const topts = ['<option value="all">All kinds</option>'].concat(Object.keys(CQ_TYPE).map(k => `<option value="${k}">${cqEsc(CQ_TYPE[k])}</option>`)).join('');
  const ropts = ['<option value="all">All outcomes</option>'].concat(Object.keys(CQ_RES).map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
  return `<style>
    .cq h1{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:28px;margin:6px 0 4px}
    .cq .cq-sub{color:var(--muted);font-size:13px;margin:0 0 16px;max-width:820px;line-height:1.5}
    .cq-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:14px}
    .cq-in{flex:1 1 240px;min-width:0;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:8px 16px;font:inherit;font-size:14px}
    .cq-sel{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;max-width:100%}
    .cq-chk{font-size:13px;color:var(--muted);display:inline-flex;gap:6px;align-items:center}
    .cq-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
    .cq-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:10px 14px}
    .cq-tile b{display:block;font-size:24px;font-weight:600;line-height:1.2}
    .cq-tile span{font-size:12px;color:var(--muted)}
    .cq-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:12px 14px 12px;margin-bottom:14px}
    .cq-card h2{font-size:14px;font-weight:600;margin:0 0 2px}
    .cq-card .cq-note{color:var(--muted);font-size:12px;margin:0 0 10px;line-height:1.45}
    .cq-meta{color:var(--muted);font-size:12px;margin:0 0 8px;min-height:16px}
    table.cq-t{width:100%;border-collapse:collapse;font-size:13px}
    .cq-t th{text-align:left;font-size:11px;font-weight:600;color:var(--muted);padding:8px 8px;border-bottom:1px solid var(--border);white-space:nowrap}
    .cq-t td{padding:9px 8px;border-bottom:1px solid var(--border2);vertical-align:top}
    .cq-t .n{text-align:right;font-variant-numeric:tabular-nums}
    .cq-t tr.cq-br{cursor:pointer}
    .cq-t tr.cq-br:hover td,.cq-t tr.cq-br:focus-visible td,.cq-t tr.cq-br.on td{background:var(--surface2)}
    .cq-t tr.cq-br:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .cq-t tr.cq-row{cursor:pointer}
    .cq-t tr.cq-row:hover td,.cq-t tr.cq-row:focus-visible td,.cq-t tr.cq-row.on td{background:var(--surface2)}
    .cq-t tr.cq-row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .cq-t td.cq-det{padding:14px 12px 18px;background:var(--surface2)}
    .cq-bars{display:grid;grid-template-columns:minmax(120px,190px) 1fr auto;gap:6px 10px;align-items:center;font-size:13px}
    .cq-trk{height:14px;border-radius:7px;background:var(--surface2);display:flex;overflow:hidden}
    .cq-seg{height:100%;min-width:2px}
    .cq-val{font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted);white-space:nowrap}
    .cq-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);margin:0 0 10px}
    .cq-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
    .cq-pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;background:var(--surface2);color:var(--muted);margin-right:4px;white-space:nowrap}
    .cq-pill.warn{background:var(--warn-bg);color:var(--warn)}
    .cq-muted{color:var(--muted)}
    .cq-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:18px 28px}
    .cq-eye{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
    .cq-kv{margin:0 0 4px;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
    .cq-kv span{color:var(--muted)}
    .cq-orig{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;margin:0 0 10px;overflow-wrap:anywhere}
    .cq-btn{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}
    .cq-btn:disabled{opacity:.4;cursor:default}
    .cq-pager{display:flex;align-items:center;gap:10px;justify-content:flex-end;padding:10px 0 2px}
    .cq-foot{color:var(--muted);font-size:12px;line-height:1.5;margin:12px 0 0;max-width:820px}
    @media (max-width:760px){.cq-t .hm{display:none}.cq-grid{grid-template-columns:1fr}.cq h1{font-size:24px}.cq-bars{grid-template-columns:minmax(90px,130px) 1fr auto}}
  </style>
  <div class="cq">
    <h1>Client Complaints</h1>
    <p class="cq-sub">Every complaint written into a Phorest client card or visit note, read one by one and sorted by branch, year, kind and how it was resolved. Level 5 only. It shows what staff wrote down, not every complaint that happened, and it is a copy from 21 Oct 2026.</p>
    <div class="cq-bar">
      <select id="cqB" class="cq-sel" aria-label="Branch">${bopts}</select>
    </div>
    <div id="cqTop"><p class="cq-meta">Loading…</p></div>
    <div class="cq-card">
      <h2>The complaints</h2>
      <p class="cq-note">Tap one to read the original note and how it ended. Redo notes with no reason written are in here as complaints with the reason left blank.</p>
      <div class="cq-bar">
        <input id="cqQ" class="cq-in" type="search" inputmode="search" autocomplete="off" placeholder="Name, stylist or words in the note" aria-label="Search complaints" value="${cqEsc(CQ.q)}">
        <select id="cqS" class="cq-sel" aria-label="Where it was written"><option value="visit">Visit notes</option><option value="client">Client card notes</option></select>
        <select id="cqT" class="cq-sel" aria-label="Kind">${topts}</select>
        <select id="cqR" class="cq-sel" aria-label="Outcome">${ropts}</select>
        <label class="cq-chk"><input id="cqL" type="checkbox"> Unsure only</label>
      </div>
      <p class="cq-meta" id="cqMeta" aria-live="polite"></p>
      <div id="cqBody" style="overflow-x:auto"><p class="cq-meta">Loading…</p></div>
    </div>
    <p class="cq-foot">How to read it. A complaint here is a note where the client was unhappy with the service, result, price, wait or experience, or where a redo, refund or credit was given because the result was not right. Cancellation apologies, deposit rules, Google review requests and clients unhappy with another salon were left out. A free redo means a redo was written down; most of them had no charge on the visit, some did. The rate per 1,000 noted visits is there because branches do not write notes equally, so the raw count favours the branch that writes most. Marasy closed in 2022. Not included: WhatsApp complaints, respond.io tags, Google reviews, and anything nobody typed into Phorest. Client card notes have no date, so they are counted apart. Unsure means the note was too short to be sure, usually a bare "redo".</p>
  </div>`;
}

function cqWire() {
  const sel = document.getElementById('cqB'), q = document.getElementById('cqQ'), body = document.getElementById('cqBody'), top = document.getElementById('cqTop');
  if (sel && !sel.dataset.w) {
    sel.dataset.w = '1';
    sel.addEventListener('change', () => { CQ.branch = sel.value; CQ.page = 0; cqOpen = 0; cqSave(); cqLoadSummary(); cqLoadList(); });
  }
  if (q && !q.dataset.w) {
    q.dataset.w = '1';
    q.addEventListener('input', () => { CQ.q = q.value; CQ.page = 0; cqOpen = 0; clearTimeout(cqTimer); cqTimer = setTimeout(cqLoadList, 300); });
  }
  [['cqS', 'src'], ['cqT', 'type'], ['cqR', 'res']].forEach(([id, k]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.w) {
      el.dataset.w = '1';
      el.value = CQ[k];
      el.addEventListener('change', () => { CQ[k] = el.value; CQ.page = 0; cqOpen = 0; cqLoadList(); });
    }
  });
  const low = document.getElementById('cqL');
  if (low && !low.dataset.w) {
    low.dataset.w = '1';
    low.checked = CQ.low;
    low.addEventListener('change', () => { CQ.low = low.checked; CQ.page = 0; cqOpen = 0; cqLoadList(); });
  }
  if (body && !body.dataset.w) {
    body.dataset.w = '1';
    body.addEventListener('click', cqClick);
    body.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('cq-row')) { e.preventDefault(); cqClick(e); }
    });
  }
  if (top && !top.dataset.w) {
    top.dataset.w = '1';
    top.addEventListener('click', cqTopClick);
    top.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('cq-br')) { e.preventDefault(); cqTopClick(e); }
    });
  }
}

function cqTopClick(e) {
  const row = e.target.closest && e.target.closest('tr.cq-br');
  if (!row) return;
  CQ.branch = CQ.branch === row.dataset.b ? 'all' : row.dataset.b;
  const sel = document.getElementById('cqB'); if (sel) sel.value = CQ.branch;
  CQ.page = 0; cqOpen = 0; cqSave(); cqLoadSummary(); cqLoadList();
}

function cqClick(e) {
  const t = e.target;
  const pg = t.closest && t.closest('[data-pg]');
  if (pg) { CQ.page = Math.max(0, CQ.page + Number(pg.dataset.pg)); cqOpen = 0; cqLoadList(); return; }
  const row = t.closest && t.closest('tr.cq-row');
  if (row) cqToggle(row);
}

function cqToggle(row) {
  const id = Number(row.dataset.i);
  const body = document.getElementById('cqBody');
  body.querySelectorAll('tr.cq-detrow').forEach(r => r.remove());
  body.querySelectorAll('tr.cq-row.on').forEach(r => r.classList.remove('on'));
  if (cqOpen === id) { cqOpen = 0; return; }
  const r = ((cqList && cqList.rows) || []).find(x => x.id === id);
  if (!r) return;
  cqOpen = id;
  row.classList.add('on');
  const det = document.createElement('tr');
  det.className = 'cq-detrow';
  det.innerHTML = `<td class="cq-det" colspan="${row.children.length}">${cqCard(r)}</td>`;
  row.after(det);
}

function cqCard(r) {
  const conf = r.confidence === 'low' ? '<span class="cq-pill warn">Unsure</span>' : '';
  return `<div class="cq-grid">
    <div>
      <div class="cq-eye">Where and who</div>
      <p class="cq-kv"><span>Branch</span> ${cqEsc(cqBr(r.branch))}${r.src === 'client' ? ' <span class="cq-muted">(the branch the client sits under)</span>' : ''}</p>
      <p class="cq-kv"><span>Date</span> ${cqEsc(cqDay(r.date))}</p>
      ${r.stylists ? `<p class="cq-kv"><span>Stylist</span> ${cqEsc(r.stylists)}</p>` : ''}
      ${r.services ? `<p class="cq-kv"><span>Services that day</span> ${cqEsc(r.services)}</p>` : ''}
      ${r.fee != null && r.src === 'visit' ? `<p class="cq-kv"><span>Charged that visit</span> AED ${cqNum(r.fee)}</p>` : ''}
      ${r.handled_by ? `<p class="cq-kv"><span>Handled by</span> ${cqEsc(r.handled_by)}</p>` : ''}
      <p class="cq-kv"><span>Phorest ID</span> ${cqEsc(r.phorest_id)}</p>
    </div>
    <div>
      <div class="cq-eye">What was written ${conf}</div>
      <div class="cq-orig">${cqText(r.note)}</div>
      <div class="cq-eye">How it was read</div>
      <p class="cq-kv"><span>Kind</span> ${cqEsc(CQ_TYPE[r.type] || r.type || 'Unclear')}</p>
      <p class="cq-kv"><span>Problem</span> ${cqEsc(r.detail || 'Not stated')}</p>
      <p class="cq-kv"><span>Outcome</span> ${cqEsc(CQ_RES[r.resolution] || r.resolution || 'Unclear')}${r.resolution_detail ? ': ' + cqEsc(r.resolution_detail) : ''}</p>
    </div>
  </div>`;
}

function cqBars(rows, labelOf, total, colour) {
  if (!rows.length) return '<p class="cq-meta">Nothing here.</p>';
  const max = Math.max(...rows.map(r => r.n), 1);
  return `<div class="cq-bars">${rows.map(r => `<div>${cqEsc(labelOf(r))}</div>
    <div class="cq-trk" role="img" aria-label="${cqEsc(labelOf(r))}: ${r.n}"><div class="cq-seg" style="width:${(100 * r.n / max).toFixed(1)}%;background:${colour}"></div></div>
    <div class="cq-val">${cqNum(r.n)} · ${cqPct(r.n, total)}</div>`).join('')}</div>`;
}

function cqYears(rows) {
  if (!rows.length) return '<p class="cq-meta">Nothing here.</p>';
  const byYr = {};
  rows.forEach(r => { (byYr[r.yr] = byYr[r.yr] || { yr: r.yr, tot: 0, seg: [] }); byYr[r.yr].tot += r.n; byYr[r.yr].seg.push(r); });
  const yrs = Object.values(byYr).sort((a, b) => a.yr - b.yr);
  const max = Math.max(...yrs.map(y => y.tot), 1);
  const used = Array.from(new Set(rows.map(r => r.branch)));
  const order = ['SAA', 'KCA', 'MC', 'AQ', 'MRY', 'FRA', 'BAH'].filter(b => used.includes(b));
  const legend = CQ.branch === 'all'
    ? `<div class="cq-legend">${order.map(b => `<span><i style="background:${CQ_COLOUR[b] || '#999'}"></i>${cqEsc(cqBr(b))}</span>`).join('')}</div>` : '';
  const bars = yrs.map(y => {
    const segs = order.map(b => { const s = y.seg.find(x => x.branch === b); return s ? `<div class="cq-seg" title="${cqEsc(cqBr(b))}: ${s.n}" style="width:${(100 * s.n / max).toFixed(1)}%;background:${CQ_COLOUR[b] || '#999'}"></div>` : ''; }).join('');
    const parts = order.map(b => { const s = y.seg.find(x => x.branch === b); return s ? `${cqBr(b)} ${s.n}` : ''; }).filter(Boolean).join(', ');
    return `<div>${y.yr}</div><div class="cq-trk" role="img" aria-label="${y.yr}: ${y.tot} (${cqEsc(parts)})">${segs}</div><div class="cq-val">${cqNum(y.tot)}</div>`;
  }).join('');
  return `${legend}<div class="cq-bars">${bars}</div>`;
}

function cqPaintSummary() {
  const el = document.getElementById('cqTop');
  if (!el || !cqSum) return;
  const t = cqSum.tiles || {}, total = Number(t.complaints || 0);
  const where = CQ.branch === 'all' ? '' : ' at ' + cqBr(CQ.branch);
  const tiles = [
    [cqNum(t.complaints), 'complaints in visit notes' + where],
    [cqNum(t.since_2025), 'of them since 1 Jan 2025'],
    [cqNum(t.clients), 'different clients'],
    [cqNum(t.repeat_clients), 'clients with 2 or more'],
    [cqNum(t.profile_flags), 'more on client cards, undated'],
    [cqNum(t.low_confidence), 'unsure, note too short']
  ].map(([b, s]) => `<div class="cq-tile"><b>${b}</b><span>${cqEsc(s)}</span></div>`).join('');
  const brows = (cqSum.branches || []).map(b => {
    const rate = b.noted_since_2024 ? (1000 * b.since_2024 / b.noted_since_2024).toFixed(1) : 'n/a';
    return `<tr class="cq-br${CQ.branch === b.branch ? ' on' : ''}" tabindex="0" role="button" aria-label="${cqEsc(cqBr(b.branch))}" data-b="${cqEsc(b.branch)}">
      <td><b>${cqEsc(cqBr(b.branch))}</b></td><td class="n">${cqNum(b.complaints)}</td><td class="n">${cqNum(b.since_2025)}</td><td class="n hm">${rate}</td>
      <td class="n">${cqNum(b.free_redo)}</td><td class="n hm">${cqNum(b.refund)}</td><td class="n hm">${cqNum(b.discount_credit)}</td><td class="n hm">${cqNum(b.free_service)}</td>
      <td class="n hm">${cqNum(b.adjusted)}</td><td class="n hm">${cqNum(b.talked)}</td><td class="n hm">${cqNum(b.lost)}</td><td class="n">${cqNum(b.no_outcome)}</td></tr>`;
  }).join('');
  const types = (cqSum.types || []).map(r => ({ n: r.n, k: r.type }));
  const ress = (cqSum.resolutions || []).map(r => ({ n: r.n, k: r.resolution }));
  el.innerHTML = `<div class="cq-tiles">${tiles}</div>
    <div class="cq-card"><h2>By branch</h2>
      <p class="cq-note">Visit notes only. Tap a branch to filter the rest of the page to it. The rate is complaints per 1,000 visits that had a note, since 1 Jan 2024, so branches that write fewer notes are not flattered.</p>
      <div style="overflow-x:auto"><table class="cq-t"><tr><th>Branch</th><th class="n">Complaints</th><th class="n">Since 2025</th><th class="n hm">Per 1,000 noted</th><th class="n">Free redo</th><th class="n hm">Refund</th><th class="n hm">Discount or credit</th><th class="n hm">Free service</th><th class="n hm">Fixed on the day</th><th class="n hm">Talked or escalated</th><th class="n hm">Client lost</th><th class="n">No outcome</th></tr>${brows}</table></div></div>
    <div class="cq-card"><h2>By year</h2><p class="cq-note">Complaints by the year of the visit${CQ.branch === 'all' ? ', split by branch' : ''}. The early years are thin because few notes were typed then.</p>${cqYears(cqSum.years || [])}</div>
    <div class="cq-card"><h2>What the complaint was about</h2>${cqBars(types, r => CQ_TYPE[r.k] || r.k, total, 'var(--accent)')}</div>
    <div class="cq-card"><h2>How it was resolved</h2><p class="cq-note">What the note says happened. No outcome written means the problem is on record but the note does not say how it ended.</p>${cqBars(ress, r => CQ_RES[r.k] || r.k, total, 'var(--accent)')}</div>`;
}

function cqPaintList() {
  const body = document.getElementById('cqBody'), meta = document.getElementById('cqMeta');
  if (!body || !cqList) return;
  const rows = cqList.rows || [], total = Number(cqList.total || 0);
  const from = total ? CQ.page * CQ_PAGE + 1 : 0, to = CQ.page * CQ_PAGE + rows.length;
  if (meta) meta.textContent = total ? `${cqNum(from)} to ${cqNum(to)} of ${cqNum(total)} complaint${total === 1 ? '' : 's'}` : '';
  if (!rows.length) { body.innerHTML = '<p class="cq-meta" style="padding:10px 4px">No complaint matches that.</p>'; return; }
  const tr = rows.map(r => `<tr class="cq-row" tabindex="0" role="button" aria-label="Open this complaint" data-i="${r.id}">
      <td style="white-space:nowrap">${cqEsc(cqDay(r.date))}</td>
      <td class="hm">${cqEsc(cqBr(r.branch))}</td>
      <td><b>${cqEsc(r.client || 'No name')}</b></td>
      <td>${cqEsc(r.detail || 'Not stated')}${r.confidence === 'low' ? ' <span class="cq-pill warn">unsure</span>' : ''}<div class="cq-muted" style="font-size:12px">${cqEsc(CQ_TYPE[r.type] || '')}</div></td>
      <td>${cqEsc(CQ_RES[r.resolution] || '')}</td>
    </tr>`).join('');
  body.innerHTML = `<table class="cq-t"><tr><th>Date</th><th class="hm">Branch</th><th>Client</th><th>What happened</th><th>Outcome</th></tr>${tr}</table>
    <div class="cq-pager"><button type="button" class="cq-btn" data-pg="-1"${CQ.page === 0 ? ' disabled' : ''}>Previous</button>
    <button type="button" class="cq-btn" data-pg="1"${to >= total ? ' disabled' : ''}>Next</button></div>`;
}

async function cqLoadSummary() {
  const el = document.getElementById('cqTop');
  if (!el) return;
  const seq = ++cqSeqS;
  try {
    const { data, error } = await sb.rpc('client_complaints_summary', { p_branch: CQ.branch });
    if (error) throw error;
    if (seq !== cqSeqS) return;
    cqSum = data;
    cqPaintSummary();
  } catch (e) {
    console.error(e);
    if (seq !== cqSeqS) return;
    el.innerHTML = '<p class="cq-meta" style="padding:10px 4px">The complaints did not load. Refresh to try again.</p>';
  }
}

async function cqLoadList() {
  const body = document.getElementById('cqBody');
  if (!body) return;
  const seq = ++cqSeqL;
  try {
    const { data, error } = await sb.rpc('client_complaints_list', {
      p_branch: CQ.branch, p_src: CQ.src, p_type: CQ.type, p_resolution: CQ.res, p_q: CQ.q.trim(), p_low: CQ.low,
      p_limit: CQ_PAGE, p_offset: CQ.page * CQ_PAGE
    });
    if (error) throw error;
    if (seq !== cqSeqL) return;
    cqList = data;
    cqPaintList();
  } catch (e) {
    console.error(e);
    if (seq !== cqSeqL) return;
    body.innerHTML = '<p class="cq-meta" style="padding:10px 4px">The list did not load. Refresh to try again.</p>';
  }
}

function renderComplaints() {
  const el = document.getElementById('complaintsContent');
  if (!el) return;
  if (!cqLevelOk()) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Client Complaints is for Level 5 only.</p></div>'; return; }
  el.innerHTML = cqShell();
  cqWire();
  cqOpen = 0;
  cqLoadSummary();
  cqLoadList();
}
