// Client Complaints (Kate, 22 Oct 2026): the historical map of client complaints, per branch, per year, by kind and by
// how each one was resolved. Built from the notes staff typed into Phorest (client card and visit notes), copied on
// 21 Oct 2026 for the Zenoti move, then read and sorted one by one. A snapshot, not live.
//
// Kate, 22 Oct 2026: Levels 2 and up may view it and log a complaint from it ("complaints view and complaints submission shall be
// available to level 2 and up"). The form saves through client_complaint_submit into the same table, so a logged complaint is counted
// like any other and shows a "Logged by staff" mark; the person who logged it (or Level 5) can remove it again.
// A logged complaint is tracked here instead of in WhatsApp (Kate, 22 Oct 2026): it starts Open unless it was resolved when logged, takes
// follow-up notes (who was spoken to, what was agreed) in client_complaint_update, and is marked Resolved with how it ended, or reopened.
// Calls (migrations/client_complaints.sql), all Levels 2 and up; the first two read only:
//   client_complaints_summary   everything on the page above the list: tiles, branch table, years, kinds, outcomes
//   client_complaints_list      a page of the complaints themselves, with the original note
// The table behind them is owner_read only and the functions refuse anyone under Level 2, because the dashboard's
// table policies check membership, not level. Nothing here is stored in the browser except the rows-per-page pick: no
// names or notes ever go into localStorage.
//
// Branch is the masthead's Branch chips (sel.branch), like every other page (Kate, 22 Oct 2026: "we must use global sticky
// header filter"); there is no Period, it is a snapshot. The page keeps only its own list filters, sort and page size.
// The summary and list take the branch as 'all', one code, or codes joined by commas.
// What it cannot show: complaints nobody wrote down, WhatsApp complaints, and Google reviews (that is its own page).
const CQ_STORE = 'trs-client-complaints';
const CQ = { src: 'visit', type: 'all', res: 'all', google: 'all', status: 'all', q: '', low: false, page: 0, size: 10, sort: 'date', dir: 'desc' };
const CQ_SIZES = [10, 20, 50, 100];
try {
  const st = JSON.parse(localStorage.getItem(CQ_STORE) || '{}');
  if (CQ_SIZES.includes(st.size)) CQ.size = st.size;
} catch (e) {}
const cqSave = () => { try { localStorage.setItem(CQ_STORE, JSON.stringify({ size: CQ.size })); } catch (e) {} };
let cqMode = 'main';   // 'main' = Client Complaints, 'log' = Log a Complaint (the logged ones, with the form)
const cqSrc = () => (cqMode === 'log' ? 'logged' : CQ.src);
let cqSum = null, cqList = null, cqSeqS = 0, cqSeqL = 0, cqTimer = 0, cqOpen = 0;
// The masthead's Branch pick as the functions want it. Dashboard code FRT (Fratelli) is FRA in the notes.
const cqBranch = () => {
  const b = (typeof sel !== 'undefined' && sel && Array.isArray(sel.branch)) ? sel.branch : ['all'];
  return (!b.length || b.includes('all')) ? 'all' : b.map(c => (c === 'FRT' ? 'FRA' : c)).join(',');
};
// The masthead's Period as the functions want it: both null for All time (the notes go back to 2016, the chip starts in 2021, and the undated
// client-card notes count only then); otherwise the window's first and last day.
const cqWin = () => {
  try {
    if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return { p_from: null, p_to: null };
    if (typeof dateFrom !== 'undefined' && dateFrom && dateTo) return { p_from: dateToIso(dateFrom), p_to: dateToIso(dateTo) };
  } catch (e) {}
  return { p_from: null, p_to: null };
};
const cqWindowed = () => { const w = cqWin(); return !!(w.p_from || w.p_to); };
let cqAllTimeDone = false;
const cqPicked = () => { const b = cqBranch(); return b === 'all' ? [] : b.split(','); };
const CQ_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', MRY: 'Marasy', FRA: 'Fratelli', BAH: 'Bahrain' };
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
  client_lost_or_cancelled: 'Client cancelled or left', no_action_noted: 'No outcome written', unclear: 'Unclear', open: 'Still open'
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
const cqLevelOk = (pg) => typeof TRS_LEVEL !== 'undefined' && (typeof trsPageOpen === 'function'
  ? trsPageOpen(pg || 'complaints', TRS_LEVEL, typeof TRS_EXTRA !== 'undefined' ? TRS_EXTRA : null) : TRS_LEVEL >= 2);

// The mini side nav: the "On this page" rail the Ledgers pages carry (lgShell in branch-ledger.js; spy() lights the entry in view).
const CQ_RAIL = [['cq-branch', 'By branch'], ['cq-year', 'By year'], ['cq-kind', 'What it was about'], ['cq-res', 'How it was resolved'], ['cq-list', 'The complaints']];
function cqRailShell(body, items) {
  return typeof lgShell === 'function' ? lgShell(items || CQ_RAIL, body, 'lg-shell-wide') : body;
}

async function cqRemove(id) {
  if (!window.confirm('Remove this logged complaint?')) return;
  try {
    const { data, error } = await sb.rpc('client_complaint_submission_delete', { p_id: id });
    if (error) throw error;
    if (!data) { window.alert('Only the person who logged it, or Level 5, can remove it.'); return; }
    cqOpen = 0; cqLoadSummary(); cqLoadList();
  } catch (e) { console.error(e); window.alert('It could not be removed. Try again.'); }
}

function cqCss() {
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
    .cq-t tr.cq-br.on td{background:var(--surface2)}
    .cq-t th.cq-sort{cursor:pointer;user-select:none}
    .cq-t th.cq-sort:hover,.cq-t th.cq-sort:focus-visible{color:var(--text);background:var(--surface2)}
    .cq-t th.cq-sort:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .cq-t th.cq-sort .ar{display:inline-block;width:12px;margin-left:4px;font-size:10px;opacity:.35}
    .cq-t th.cq-sort[aria-sort] {color:var(--text)}
    .cq-t th.cq-sort[aria-sort] .ar{opacity:1}
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
    .cq-pager{display:flex;align-items:center;gap:10px;justify-content:flex-end;flex-wrap:wrap;padding:10px 0 2px}
    .cq-pager .cq-size{margin-right:auto;display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
    .cq-tip{position:fixed;z-index:9999;pointer-events:none;max-width:260px;padding:6px 10px;border-radius:8px;font-size:12px;line-height:1.4;background:var(--surface2);color:var(--text);border:1px solid var(--border);box-shadow:0 4px 14px rgba(0,0,0,.25);display:none}
    .cq [data-tip]{cursor:default}
    details.cq-card>summary{cursor:pointer;font-size:14px;font-weight:600;list-style:none}
    details.cq-card>summary::-webkit-details-marker{display:none}
    details.cq-card>summary::before{content:'+';display:inline-block;width:16px;color:var(--muted)}
    details.cq-card[open]>summary::before{content:'−'}
    .cq-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 14px;margin:10px 0 12px}
    .cq-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);min-width:0}
    .cq-form .wide{grid-column:1/-1}
    .cq-form .cq-in,.cq-form .cq-sel,.cq-form textarea{flex:none;width:100%;box-sizing:border-box;border-radius:12px;color:var(--text)}
    .cq-form textarea{border:1px solid var(--border);background:var(--surface);padding:9px 14px;font:inherit;font-size:14px;resize:vertical}
    .cq-msg{font-size:13px}.cq-msg.err{color:var(--warn)}
    .cq-btn.pri{background:var(--accent);color:#102;border-color:var(--accent);font-weight:600}
    .cq-foot{color:var(--muted);font-size:12px;line-height:1.5;margin:12px 0 0;max-width:820px}
    @media (max-width:760px){.cq-t .hm{display:none}.cq-grid{grid-template-columns:1fr}.cq h1{font-size:24px}.cq-bars{grid-template-columns:minmax(90px,130px) 1fr auto}}
  </style>`;
}

function cqShell() {
  const topts = ['<option value="all">All kinds</option>'].concat(Object.keys(CQ_TYPE).map(k => `<option value="${k}">${cqEsc(CQ_TYPE[k])}</option>`)).join('');
  const ropts = ['<option value="all">All outcomes</option>'].concat(Object.keys(CQ_RES).map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
  return cqCss() + `<div class="cq">
    <h1>Client Complaints</h1>
    <p class="cq-sub">Every complaint written into a Phorest client card or visit note, read one by one and sorted by branch, year, kind and how it was resolved. Levels 2 and up. It shows what staff wrote down, not every complaint that happened, and it is a copy from 21 Oct 2026.</p>
    ${cqRailShell(`<div id="cqTop"><p class="cq-meta">Loading…</p></div>
    <div class="cq-card" id="cq-list">
      <h2>The complaints</h2>
      <p class="cq-note">Tap one to read the original note and how it ended. Redo notes with no reason written are in here as complaints with the reason left blank.</p>
      <div class="cq-bar">
        <input id="cqQ" class="cq-in" type="search" inputmode="search" autocomplete="off" placeholder="Name, stylist or words in the note" aria-label="Search complaints" value="${cqEsc(CQ.q)}">
        <select id="cqS" class="cq-sel" aria-label="Where it was written"><option value="visit">Visit notes</option><option value="client">Client card notes</option></select>
        <select id="cqT" class="cq-sel" aria-label="Kind">${topts}</select>
        <select id="cqR" class="cq-sel" aria-label="Outcome">${ropts}</select>
        <select id="cqSt" class="cq-sel" aria-label="Status"><option value="all">Status: any</option><option value="open">Still open</option><option value="resolved">Resolved</option></select>
        <select id="cqG" class="cq-sel" aria-label="Google review"><option value="all">Google: any</option><option value="yes">Left a Google review</option><option value="no">No Google review found</option></select>
        <label class="cq-chk"><input id="cqL" type="checkbox"> Unsure only</label>
      </div>
      <p class="cq-meta" id="cqMeta" aria-live="polite"></p>
      <div id="cqBody" style="overflow-x:auto"><p class="cq-meta">Loading…</p></div>
    </div>`)}
    <p class="cq-foot">How to read it. A complaint here is a note where the client was unhappy with the service, result, price, wait or experience, or where a redo, refund or credit was given because the result was not right. Cancellation apologies, deposit rules, Google review requests and clients unhappy with another salon were left out. A free redo means a redo was written down; most of them had no charge on the visit, some did. The rate per 1,000 noted visits is there because branches do not write notes equally, so the raw count favours the branch that writes most. Marasy closed in 2022. Not included: WhatsApp complaints, respond.io tags, Google reviews, and anything nobody typed into Phorest. Client card notes have no date, so they are counted apart and only show in All time. Unsure means the note was too short to be sure, usually a bare "redo". The Google column looks for a Google review whose reviewer name is the client's full name, left on or after the complaint. Reviewers often post a first name or a nickname, so None found is not proof that nothing was posted, and a match is the same name, not a certainty it is about that visit.</p>
  </div>`;
}

function cqWire() {
  const q = document.getElementById('cqQ'), body = document.getElementById('cqBody'), top = document.getElementById('cqTop');
  const go = document.getElementById('cqfGo');
  if (go && !go.dataset.w) { go.dataset.w = '1'; go.addEventListener('click', cqSubmit); }
  if (q && !q.dataset.w) {
    q.dataset.w = '1';
    q.addEventListener('input', () => { CQ.q = q.value; CQ.page = 0; cqOpen = 0; clearTimeout(cqTimer); cqTimer = setTimeout(cqLoadList, 300); });
  }
  [['cqS', 'src'], ['cqT', 'type'], ['cqR', 'res'], ['cqSt', 'status'], ['cqG', 'google']].forEach(([id, k]) => {
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
    body.addEventListener('change', e => {
      if (e.target && e.target.id === 'cqN') { CQ.size = Number(e.target.value) || 10; CQ.page = 0; cqOpen = 0; cqSave(); cqLoadList(); }
    });
    body.addEventListener('keydown', e => {
      const c = e.target.classList;
      if ((e.key === 'Enter' || e.key === ' ') && c && (c.contains('cq-row') || c.contains('cq-sort'))) { e.preventDefault(); cqClick(e); }
    });
  }
  if (top && !top.dataset.w) {
    top.dataset.w = '1';
    cqWireTip(top);
  }
}

// One floating tooltip for the bars: hover shows the number, a tap does on a phone. The native title tooltip showed blank.
function cqWireTip(root) {
  let tip = document.getElementById('cqTip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'cqTip'; tip.className = 'cq-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  const at = (e, el) => {
    tip.textContent = el.dataset.tip; tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(e.clientX + 14, window.innerWidth - w - 6)) + 'px';
    tip.style.top = Math.max(6, (e.clientY - h - 12 < 6) ? e.clientY + 18 : e.clientY - h - 12) + 'px';
  };
  const off = () => { tip.style.display = 'none'; };
  root.addEventListener('mousemove', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) at(e, el); else off(); });
  root.addEventListener('mouseleave', off);
  root.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) at(e, el); else off(); });
  window.addEventListener('scroll', off, { passive: true });
}

function cqClick(e) {
  const t = e.target;
  const up = t.closest && t.closest('[data-up]');
  if (up) { cqUpdate(Number(up.dataset.id), up.dataset.up); return; }
  const del = t.closest && t.closest('[data-del]');
  if (del) { cqRemove(Number(del.dataset.del)); return; }
  const th = t.closest && t.closest('th[data-s]');
  if (th) {
    const k = th.dataset.s;
    if (CQ.sort === k) CQ.dir = CQ.dir === 'asc' ? 'desc' : 'asc';
    else { CQ.sort = k; CQ.dir = k === 'date' ? 'desc' : 'asc'; }
    CQ.page = 0; cqOpen = 0; cqLoadList(); return;
  }
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

// Which complaints reached Google: a Google review whose reviewer name is the client's full name, left on or after the complaint.
// A name match only (reviewers often post a first name), so "none found" is not proof there is no review.
function cqGoogle(r) {
  if (!r.g_date && r.g_manual) return `<span class="cq-pill"><a href="${cqEsc(r.g_manual)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Posted (logged)</a></span>`;
  if (!r.g_date) return '<span class="cq-muted">None found</span>';
  const txt = `${'★'.repeat(Math.max(0, Math.min(5, Number(r.g_stars) || 0)))} ${cqDay(r.g_date)}`;
  const low = Number(r.g_stars) > 0 && Number(r.g_stars) <= 3;
  const body = r.g_url ? `<a href="${cqEsc(r.g_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${cqEsc(txt)}</a>` : cqEsc(txt);
  return `<span class="cq-pill${low ? ' warn' : ''}">${body}</span>`;
}

function cqFollow(r) {
  const ups = (r.updates || []).map(u => {
    const tag = u.status === 'resolved' ? ` <span class="cq-pill">Resolved: ${cqEsc(CQ_RES[u.res] || u.res || '')}</span>` : (u.status === 'open' ? ' <span class="cq-pill warn">Reopened</span>' : '');
    return `<p class="cq-kv"><span>${cqEsc(cqDay(u.at))}, ${cqEsc(u.by || '')}</span>${tag} ${cqText(u.note || '')}</p>`;
  }).join('');
  const ropts = ['<option value="">How it ended (needed to mark it resolved)</option>'].concat(Object.keys(CQ_RES).filter(k => k !== 'unclear' && k !== 'open')
    .map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
  const isOpen = r.status === 'open';
  return `<div style="grid-column:1/-1">
    <div class="cq-eye">Follow-up ${isOpen ? '<span class="cq-pill warn">Open</span>' : '<span class="cq-pill">Resolved</span>'}</div>
    ${ups || '<p class="cq-kv cq-muted">No follow-up written yet.</p>'}
    <div class="cq-form" style="margin-top:8px">
      <label class="wide">Add an update<textarea id="cqu-note" rows="2" maxlength="1000" placeholder="Who you spoke to, what was agreed, what was done"></textarea></label>
      <label>${isOpen ? 'Mark it resolved with' : 'Reopen it, or add a note'}<select id="cqu-res" class="cq-sel"${isOpen ? '' : ' disabled'}>${ropts}</select></label>
    </div>
    <div class="cq-bar"><button type="button" class="cq-btn" data-up="note" data-id="${r.id}">Add update</button>
      ${isOpen ? `<button type="button" class="cq-btn pri" data-up="resolved" data-id="${r.id}">Mark resolved</button>` : `<button type="button" class="cq-btn" data-up="open" data-id="${r.id}">Reopen</button>`}
      <span id="cqu-msg" class="cq-msg err" aria-live="polite"></span></div>
  </div>`;
}

async function cqUpdate(id, kind) {
  const note = (document.getElementById('cqu-note') || {}).value || '';
  const res = (document.getElementById('cqu-res') || {}).value || '';
  const msg = document.getElementById('cqu-msg');
  const say = t => { if (msg) msg.textContent = t; };
  if (kind === 'resolved' && !res) return say('Pick how it ended, then mark it resolved.');
  if (kind !== 'resolved' && note.trim().length < 2) return say('Write the update first.');
  say('Saving…');
  try {
    const { error } = await sb.rpc('client_complaint_update', { p_id: id, p_note: note.trim(), p_resolution: kind === 'resolved' ? res : '', p_status: kind });
    if (error) throw error;
    cqOpen = 0;
    await Promise.all([cqLoadSummary(), cqLoadList()]);
    const row = document.querySelector(`#cqBody tr.cq-row[data-i="${id}"]`);
    if (row) cqToggle(row);
  } catch (e) { console.error(e); say((e && e.message) || 'It did not save. Try again.'); }
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
      <p class="cq-kv"><span>Google review</span> ${(r.g_date || r.g_manual) ? cqGoogle(r) : 'None found under this name'}</p>
      ${r.by ? `<p class="cq-kv"><span>Logged by</span> ${cqEsc(r.by)}${r.by_at ? ' on ' + cqEsc(cqDay(r.by_at)) : ''} <button type="button" class="cq-btn" data-del="${r.id}" style="margin-left:8px">Remove</button></p>` : `<p class="cq-kv"><span>Phorest ID</span> ${cqEsc(r.phorest_id)}</p>`}
    </div>
    <div>
      <div class="cq-eye">What was written ${conf}</div>
      <div class="cq-orig">${cqText(r.note)}</div>
      <div class="cq-eye">How it was read</div>
      <p class="cq-kv"><span>Kind</span> ${cqEsc(CQ_TYPE[r.type] || r.type || 'Unclear')}</p>
      <p class="cq-kv"><span>Problem</span> ${cqEsc(r.detail || 'Not stated')}</p>
      <p class="cq-kv"><span>Outcome</span> ${r.status === 'open' ? 'Still open' : cqEsc(CQ_RES[r.resolution] || r.resolution || 'Unclear')}${r.resolution_detail ? ': ' + cqEsc(r.resolution_detail) : ''}</p>
    </div>
    ${r.by ? cqFollow(r) : ''}
  </div>`;
}

function cqBars(rows, labelOf, total, colour) {
  if (!rows.length) return '<p class="cq-meta">Nothing here.</p>';
  const max = Math.max(...rows.map(r => r.n), 1);
  return `<div class="cq-bars">${rows.map(r => `<div>${cqEsc(labelOf(r))}</div>
    <div class="cq-trk" role="img" aria-label="${cqEsc(labelOf(r))}: ${r.n}" data-tip="${cqEsc(labelOf(r))}: ${cqNum(r.n)} complaint${r.n === 1 ? '' : 's'} (${cqPct(r.n, total)})"><div class="cq-seg" style="width:${(100 * r.n / max).toFixed(1)}%;background:${colour}"></div></div>
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
  const legend = cqPicked().length !== 1
    ? `<div class="cq-legend">${order.map(b => `<span><i style="background:${CQ_COLOUR[b] || '#999'}"></i>${cqEsc(cqBr(b))}</span>`).join('')}</div>` : '';
  const bars = yrs.map(y => {
    const segs = order.map(b => { const s = y.seg.find(x => x.branch === b); return s ? `<div class="cq-seg" data-tip="${cqEsc(cqBr(b))}, ${y.yr}: ${cqNum(s.n)} complaint${s.n === 1 ? '' : 's'} (${cqPct(s.n, y.tot)} of the year)" style="width:${(100 * s.n / max).toFixed(1)}%;background:${CQ_COLOUR[b] || '#999'}"></div>` : ''; }).join('');
    const parts = order.map(b => { const s = y.seg.find(x => x.branch === b); return s ? `${cqBr(b)} ${s.n}` : ''; }).filter(Boolean).join(', ');
    return `<div>${y.yr}</div><div class="cq-trk" role="img" aria-label="${y.yr}: ${y.tot} (${cqEsc(parts)})" data-tip="${y.yr}: ${cqNum(y.tot)} complaint${y.tot === 1 ? '' : 's'}">${segs}</div><div class="cq-val">${cqNum(y.tot)}</div>`;
  }).join('');
  return `${legend}<div class="cq-bars">${bars}</div>`;
}

function cqPaintSummary() {
  const el = document.getElementById('cqTop');
  if (!el || !cqSum) return;
  const t = cqSum.tiles || {}, total = Number(t.complaints || 0);
  const picked = cqPicked();
  const where = picked.length ? ' at ' + picked.map(cqBr).join(', ') : '';
  const tiles = [
    [cqNum(t.complaints), 'complaints in visit notes' + where],
    ...(Number(t.open_now) > 0 ? [[cqNum(t.open_now), 'logged complaints still open']] : []),
    [cqNum(t.since_2025), 'of them since 1 Jan 2025'],
    [cqNum(t.clients), 'different clients'],
    [cqNum(t.repeat_clients), 'clients with 2 or more'],
    ...(cqWindowed() ? [] : [[cqNum(t.profile_flags), 'more on client cards, undated']]),
    [cqNum(t.low_confidence), 'unsure, note too short']].concat(cqSum.google ? [[cqNum(cqSum.google.on_google), 'also left a Google review (same name)']] : []
  ).map(([b, s]) => `<div class="cq-tile"><b>${b}</b><span>${cqEsc(s)}</span></div>`).join('');
  const brows = (cqSum.branches || []).map(b => {
    const rate = b.noted_since_2024 ? (1000 * b.since_2024 / b.noted_since_2024).toFixed(1) : 'n/a';
    return `<tr class="cq-br${picked.includes(b.branch) ? ' on' : ''}">
      <td><b>${cqEsc(cqBr(b.branch))}</b></td><td class="n">${cqNum(b.complaints)}</td><td class="n">${cqNum(b.since_2025)}</td><td class="n hm">${rate}</td>
      <td class="n">${cqNum(b.free_redo)}</td><td class="n hm">${cqNum(b.refund)}</td><td class="n hm">${cqNum(b.discount_credit)}</td><td class="n hm">${cqNum(b.free_service)}</td>
      <td class="n hm">${cqNum(b.adjusted)}</td><td class="n hm">${cqNum(b.talked)}</td><td class="n hm">${cqNum(b.lost)}</td><td class="n">${cqNum(b.no_outcome)}</td></tr>`;
  }).join('');
  const types = (cqSum.types || []).map(r => ({ n: r.n, k: r.type }));
  const ress = (cqSum.resolutions || []).map(r => ({ n: r.n, k: r.resolution }));
  el.innerHTML = `<div class="cq-tiles">${tiles}</div>
    <div class="cq-card" id="cq-branch"><h2>By branch</h2>
      <p class="cq-note">Visit notes only. Every branch is shown here; pick branches in the filter at the top to narrow the rest of the page. The rate is complaints per 1,000 visits that had a note, since 1 Jan 2024, so branches that write fewer notes are not flattered.</p>
      <div style="overflow-x:auto"><table class="cq-t"><tr><th>Branch</th><th class="n">Complaints</th><th class="n">Since 2025</th><th class="n hm">Per 1,000 noted</th><th class="n">Free redo</th><th class="n hm">Refund</th><th class="n hm">Discount or credit</th><th class="n hm">Free service</th><th class="n hm">Fixed on the day</th><th class="n hm">Talked or escalated</th><th class="n hm">Client lost</th><th class="n">No outcome</th></tr>${brows}</table></div></div>
    <div class="cq-card" id="cq-year"><h2>By year</h2><p class="cq-note">Complaints by the year of the visit${picked.length === 1 ? '' : ', split by branch'}. The early years are thin because few notes were typed then.</p>${cqYears(cqSum.years || [])}</div>
    <div class="cq-card" id="cq-kind"><h2>What the complaint was about</h2>${cqBars(types, r => CQ_TYPE[r.k] || r.k, total, 'var(--accent)')}</div>
    <div class="cq-card" id="cq-res"><h2>How it was resolved</h2><p class="cq-note">What the note says happened. No outcome written means the problem is on record but the note does not say how it ended.</p>${cqBars(ress, r => CQ_RES[r.k] || r.k, total, 'var(--accent)')}</div>`;
}

function cqPaintList() {
  const body = document.getElementById('cqBody'), meta = document.getElementById('cqMeta');
  if (!body || !cqList) return;
  const rows = cqList.rows || [], total = Number(cqList.total || 0);
  const from = total ? CQ.page * CQ.size + 1 : 0, to = CQ.page * CQ.size + rows.length;
  if (meta) meta.textContent = total ? `${cqNum(from)} to ${cqNum(to)} of ${cqNum(total)} complaint${total === 1 ? '' : 's'}` : '';
  if (!rows.length) { body.innerHTML = '<p class="cq-meta" style="padding:10px 4px">No complaint matches that.</p>'; return; }
  const tr = rows.map(r => `<tr class="cq-row" tabindex="0" role="button" aria-label="Open this complaint" data-i="${r.id}">
      <td style="white-space:nowrap">${cqEsc(cqDay(r.date))}</td>
      <td class="hm">${cqEsc(cqBr(r.branch))}</td>
      <td><b>${cqEsc(r.client || 'No name')}</b></td>
      <td>${cqEsc(r.detail || 'Not stated')}${r.confidence === 'low' ? ' <span class="cq-pill warn">unsure</span>' : ''}${r.by ? ' <span class="cq-pill">logged by staff</span>' : ''}<div class="cq-muted" style="font-size:12px">${cqEsc(CQ_TYPE[r.type] || '')}</div></td>
      <td>${r.status === 'open' ? '<span class="cq-pill warn">Open</span>' : cqEsc(CQ_RES[r.resolution] || '')}</td>
      <td class="hm" style="white-space:nowrap">${cqGoogle(r)}</td>
    </tr>`).join('');
  const th = (k, label, cls) => {
    const on = CQ.sort === k;
    return `<th class="cq-sort${cls ? ' ' + cls : ''}" tabindex="0" role="columnheader button" data-s="${k}"${on ? ` aria-sort="${CQ.dir === 'asc' ? 'ascending' : 'descending'}"` : ''} title="Sort by ${label.toLowerCase()}">${label}<span class="ar" aria-hidden="true">${on ? (CQ.dir === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  };
  const sizes = CQ_SIZES.map(n => `<option value="${n}"${CQ.size === n ? ' selected' : ''}>${n}</option>`).join('');
  body.innerHTML = `<table class="cq-t"><tr>${th('date', 'Date')}${th('branch', 'Branch', 'hm')}${th('client', 'Client')}${th('detail', 'What happened')}${th('resolution', 'Outcome')}<th class="hm" title="Is there a Google review by someone with the same name, left on or after the complaint date">Google</th></tr>${tr}</table>
    <div class="cq-pager"><label class="cq-size">Show <select id="cqN" class="cq-sel" aria-label="Complaints per page">${sizes}</select> per page</label><button type="button" class="cq-btn" data-pg="-1"${CQ.page === 0 ? ' disabled' : ''}>Previous</button>
    <button type="button" class="cq-btn" data-pg="1"${to >= total ? ' disabled' : ''}>Next</button></div>`;
}

async function cqLoadSummary() {
  const el = document.getElementById('cqTop');
  if (!el) return;
  const seq = ++cqSeqS;
  try {
    const [{ data, error }, g] = await Promise.all([
      sb.rpc('client_complaints_summary', { p_branch: cqBranch(), ...cqWin() }),
      sb.rpc('client_complaints_google_count', { p_branch: cqBranch(), ...cqWin() })
    ]);
    if (error) throw error;
    if (seq !== cqSeqS) return;
    cqSum = data;
    if (cqSum && g && !g.error) cqSum.google = g.data;
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
      p_branch: cqBranch(), p_src: cqSrc(), p_type: CQ.type, p_resolution: CQ.res, p_q: CQ.q.trim(), p_low: CQ.low,
      p_limit: CQ.size, p_offset: CQ.page * CQ.size, p_sort: CQ.sort, p_dir: CQ.dir, p_google: CQ.google, p_status: CQ.status, ...cqWin()
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

// The masthead's Branch chips changed (dashboard.js NOPULSE_REDRAW): redraw the numbers and the list for the new pick.
function cqRefresh() {
  if (!document.getElementById('cqTop')) return renderComplaints();
  CQ.page = 0; cqOpen = 0;
  cqLoadSummary();
  return cqLoadList();
}

function renderComplaints() {
  const el = document.getElementById('complaintsContent');
  if (!el) return;
  const other = document.getElementById('complaintlogContent'); if (other) other.innerHTML = '';   // one page's ids at a time
  cqMode = 'main';
  if (!cqLevelOk()) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Client Complaints is for Levels 2 and up.</p></div>'; return; }
  el.innerHTML = cqShell();
  cqWire();
  cqOpen = 0;
  cqLoadSummary();
  cqLoadList();
  // Kate, 22 Oct 2026: "all time toggling pwede". The notes go back years, so the first time the page opens in a visit it asks for the
  // masthead's All time (the Period chips are the toggle after that); the chip's own redraw reloads the page, so only the chip is touched here.
  cqAllTime();
}

function cqAllTime() {
  if (cqAllTimeDone) return;
  cqAllTimeDone = true;
  const chip = document.querySelector('#periodChips .chip[data-v="All time"]');
  if (chip && !chip.disabled && chip.getAttribute('aria-pressed') !== 'true') chip.click();
}
