// Client Book (Kate, 22 Oct 2026): the Phorest client list, contact details, client notes and the notes on each
// visit, in one place. Pulled from Phorest on 21 Oct 2026 for the Zenoti move, so it is a snapshot, not live.
//
// Two calls (migrations/client_book.sql), both Level 5 only and both read only:
//   client_book_search   a page of clients: name, phone, email, branches, and whether there is a note
//   client_book_card     one client: contact details, the client note, every visit that has a note
// The tables behind them are owner_read only and the functions refuse anyone under Level 5, because the
// dashboard's table policies check membership, not level. Nothing here is stored in the browser except the
// branch pick: no names, phones, emails or notes ever go into localStorage.
//
// Own controls (search, branch), so the masthead filters are hidden here, as on Client Mix.
// Not in the pull: photos on visits (only how many), patch tests, consultation forms, reviews tabs.
const CB_STORE = 'trs-client-book';
const CB = { branch: 'all', q: '', page: 0 };
try {
  const s = JSON.parse(localStorage.getItem(CB_STORE) || '{}');
  if (typeof s.branch === 'string') CB.branch = s.branch;
} catch (e) {}
const cbSave = () => { try { localStorage.setItem(CB_STORE, JSON.stringify({ branch: CB.branch })); } catch (e) {} };
let cbData = null, cbSeq = 0, cbTimer = 0, cbOpen = '';
const CB_PAGE = 40;
const CB_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', MRY: 'Marasy', FRA: 'Fratelli', BAH: 'Bahrain' };
const CB_TOGGLE = [['all', 'All branches'], ['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'],
  ['MRY', 'Marasy (closed)'], ['FRA', 'Fratelli (closed)'], ['BAH', 'Bahrain']];

const cbEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cbNum = n => Number(n || 0).toLocaleString('en-GB');
// Phorest has "-" or "." typed into the last name box when there is none: drop those.
const cbName = r => [r.first, r.last].filter(x => x && /[\p{L}\p{N}]/u.test(x)).join(' ').trim() || 'No name';
const cbDay = iso => {
  if (!iso) return 'No date';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const cbBranches = list => (list || []).map(c => cbEsc(CB_BRANCH[c] || c)).join(', ');
const cbKey = (b, i) => b + '|' + i;
// Phorest note text is free typing: keep the line breaks, escape everything else.
const cbText = s => cbEsc(s).replace(/\r?\n/g, '<br>');
const cbLevelOk = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 5;

function cbShell() {
  const opts = CB_TOGGLE.map(([k, l]) => `<option value="${k}"${CB.branch === k ? ' selected' : ''}>${cbEsc(l)}</option>`).join('');
  return `<style>
    .cb h1{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:28px;margin:6px 0 4px}
    .cb .cb-sub{color:var(--muted);font-size:13px;margin:0 0 16px;max-width:780px;line-height:1.5}
    .cb-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:12px}
    .cb-in{flex:1 1 280px;min-width:0;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:8px 16px;font:inherit;font-size:14px}
    .cb-sel{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px}
    .cb-meta{color:var(--muted);font-size:12px;margin:0 0 8px;min-height:16px}
    .cb-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:6px 14px 10px;margin-bottom:14px}
    table.cb-t{width:100%;border-collapse:collapse;font-size:13px}
    .cb-t th{text-align:left;font-size:11px;font-weight:600;color:var(--muted);padding:8px 8px;border-bottom:1px solid var(--border)}
    .cb-t td{padding:9px 8px;border-bottom:1px solid var(--border2);vertical-align:top}
    .cb-t tr.cb-row{cursor:pointer}
    .cb-t tr.cb-row:hover td,.cb-t tr.cb-row:focus-visible td,.cb-t tr.cb-row.on td{background:var(--surface2)}
    .cb-t tr.cb-row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
    .cb-t td.cb-det{padding:14px 12px 18px;background:var(--surface2)}
    .cb-pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;background:var(--surface2);color:var(--muted);margin-right:4px;white-space:nowrap}
    .cb-pill.warn{background:var(--warn-bg);color:var(--warn)}
    .cb-muted{color:var(--muted)}
    .cb-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:18px 28px}
    .cb-eye{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
    .cb-kv{margin:0 0 4px;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
    .cb-kv span{color:var(--muted)}
    .cb-note{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;margin:0 0 14px;overflow-wrap:anywhere}
    .cb-visit{border-top:1px solid var(--border);padding:9px 0}
    .cb-visit:first-of-type{border-top:0}
    .cb-visit b{font-weight:600}
    .cb-visit .cb-at{color:var(--muted);font-size:12px;margin-left:6px}
    .cb-visit p{margin:4px 0 0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
    .cb-visit .cb-svc{color:var(--muted);font-size:12px;margin-top:3px}
    .cb-more{display:none}.cb-visits.all .cb-more{display:block}
    .cb-btn{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}
    .cb-btn:disabled{opacity:.4;cursor:default}
    .cb-pager{display:flex;align-items:center;gap:10px;justify-content:flex-end;padding:10px 0 2px}
    .cb-foot{color:var(--muted);font-size:12px;line-height:1.5;margin:12px 0 0;max-width:780px}
    @media (max-width:760px){.cb-t .hm{display:none}.cb-grid{grid-template-columns:1fr}.cb h1{font-size:24px}}
  </style>
  <div class="cb">
    <h1>Client Book</h1>
    <p class="cb-sub">Every Phorest client with their phone, email, client note and the notes on their visits. Search by name, phone number or email, then tap a client to open the card. Level 6 only. This is a copy taken from Phorest on 21 Oct 2026, so anything typed in Phorest after that is not here.</p>
    <div class="cb-bar">
      <input id="cbQ" class="cb-in" type="search" inputmode="search" autocomplete="off" placeholder="Name, phone number or email" aria-label="Search clients" value="${cbEsc(CB.q)}">
      <select id="cbB" class="cb-sel" aria-label="Branch">${opts}</select>
    </div>
    <p class="cb-meta" id="cbMeta" aria-live="polite"></p>
    <div class="cb-card"><div id="cbBody" style="overflow-x:auto"><p class="cb-meta">Loading…</p></div></div>
    <p class="cb-foot">A client sits under every Phorest branch whose list they are on, so one person can show two branches. Marasy and Fratelli are closed, and the Marasy, Khalifa City A and Saadiyat labels are matched from the data, not named by Phorest. Only visits that have a note are kept. Photos on a visit show as a count only. Patch tests, consultation forms and review tabs were not pulled. Email shows only when it is a real one: a shared or missing email shows as a label.</p>
  </div>`;
}

function cbWire() {
  const el = document.getElementById('cbQ'), sel = document.getElementById('cbB'), body = document.getElementById('cbBody');
  if (el && !el.dataset.w) {
    el.dataset.w = '1';
    el.addEventListener('input', () => {
      CB.q = el.value; CB.page = 0; cbOpen = '';
      clearTimeout(cbTimer); cbTimer = setTimeout(cbLoad, 300);
    });
  }
  if (sel && !sel.dataset.w) {
    sel.dataset.w = '1';
    sel.addEventListener('change', () => { CB.branch = sel.value; CB.page = 0; cbOpen = ''; cbSave(); cbLoad(); });
  }
  if (body && !body.dataset.w) {
    body.dataset.w = '1';
    body.addEventListener('click', cbClick);
    body.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('cb-row')) { e.preventDefault(); cbClick(e); }
    });
  }
}

function cbClick(e) {
  const t = e.target;
  const pg = t.closest && t.closest('[data-pg]');
  if (pg) { CB.page = Math.max(0, CB.page + Number(pg.dataset.pg)); cbOpen = ''; cbLoad(); return; }
  const more = t.closest && t.closest('[data-more]');
  if (more) { const v = more.parentNode.querySelector('.cb-visits'); if (v) { v.classList.add('all'); more.remove(); } return; }
  const row = t.closest && t.closest('tr.cb-row');
  if (row) cbToggle(row);
}

async function cbToggle(row) {
  const key = cbKey(row.dataset.b, row.dataset.i);
  const body = document.getElementById('cbBody');
  body.querySelectorAll('tr.cb-detrow').forEach(r => r.remove());
  body.querySelectorAll('tr.cb-row.on').forEach(r => r.classList.remove('on'));
  if (cbOpen === key) { cbOpen = ''; return; }
  cbOpen = key;
  row.classList.add('on');
  const cols = row.children.length;
  const det = document.createElement('tr');
  det.className = 'cb-detrow';
  det.innerHTML = `<td class="cb-det" colspan="${cols}"><p class="cb-meta">Loading the card…</p></td>`;
  row.after(det);
  try {
    const { data, error } = await sb.rpc('client_book_card', { p_branch: row.dataset.b, p_id: row.dataset.i });
    if (error) throw error;
    if (cbOpen !== key) return;
    det.firstChild.innerHTML = data ? cbCard(data) : '<p class="cb-meta">This client is not in the copy any more.</p>';
  } catch (err) {
    console.error(err);
    if (cbOpen === key) det.firstChild.innerHTML = '<p class="cb-meta">The card did not load. Tap the row to try again.</p>';
    cbOpen = '';
  }
}

function cbCard(c) {
  const email = c.email_status === 'real' ? cbEsc(c.email)
    : `<span class="cb-muted">${c.email_status === 'no email' ? 'No email on file' : 'Shared email, not theirs (' + cbEsc(c.email || '') + ')'}</span>`;
  const note = c.note && c.note.notes && String(c.note.notes).trim() ? c.note : null;
  const visits = c.visits || [];
  const vHtml = visits.map((v, n) => {
    const items = (v.items || []).map(s => {
      const bad = s.state === 'CANCELED' ? 'Cancelled' : s.state === 'NO_SHOW' ? 'No show' : '';
      return `${cbEsc(s.desc || 'Service')}${s.st ? ' with ' + cbEsc(s.st) : ''}${bad ? ` <span class="cb-pill warn">${bad}</span>` : ''}`;
    });
    return `<div class="cb-visit${n >= 10 ? ' cb-more' : ''}"><b>${cbEsc(cbDay(v.date))}</b><span class="cb-at">${cbEsc(String(v.at || '').trim())}</span>
      ${v.notes && String(v.notes).trim() ? `<p>${cbText(v.notes)}</p>` : ''}
      ${items.length ? `<div class="cb-svc">${items.join(' · ')}</div>` : ''}
      ${v.images ? `<div class="cb-svc">${cbNum(v.images)} photo${v.images === 1 ? '' : 's'} on this visit in Phorest, not copied here</div>` : ''}</div>`;
  }).join('');
  return `<div class="cb-grid">
    <div>
      <div class="cb-eye">Contact</div>
      <p class="cb-kv"><span>Phone</span> ${c.mobile ? cbEsc(c.mobile) : '<span class="cb-muted">None on file</span>'}</p>
      <p class="cb-kv"><span>Email</span> ${email}</p>
      <p class="cb-kv"><span>Branches</span> ${cbBranches(c.branches) || '<span class="cb-muted">Not matched</span>'}</p>
      ${c.archived ? '<p class="cb-kv"><span class="cb-pill warn">Archived in Phorest</span></p>' : ''}
      <p class="cb-kv"><span>Phorest ID</span> ${cbEsc(c.id)}</p>
      <p class="cb-kv"><span>Copied</span> ${cbEsc(cbDay(c.pulled_at))}</p>
    </div>
    <div>
      <div class="cb-eye">Client note</div>
      ${note ? `<div class="cb-note">${cbText(note.notes)}${note.archived ? ' <span class="cb-pill">archived note</span>' : ''}</div>` : '<p class="cb-kv cb-muted" style="margin-bottom:14px">No note on the client card.</p>'}
      <div class="cb-eye">Visit notes${visits.length ? ` (${cbNum(visits.length)})` : ''}</div>
      ${visits.length ? `<div class="cb-visits">${vHtml}</div>${visits.length > 10 ? `<button type="button" class="cb-btn" data-more="1" style="margin-top:8px">Show all ${cbNum(visits.length)} visits</button>` : ''}` : '<p class="cb-kv cb-muted">No visit has a note.</p>'}
    </div>
  </div>`;
}

function cbPaint() {
  const body = document.getElementById('cbBody'), meta = document.getElementById('cbMeta');
  if (!body || !cbData) return;
  const rows = cbData.rows || [], total = Number(cbData.total || 0);
  const from = total ? CB.page * CB_PAGE + 1 : 0, to = CB.page * CB_PAGE + rows.length;
  if (meta) meta.textContent = total ? `${cbNum(from)} to ${cbNum(to)} of ${cbNum(total)} client${total === 1 ? '' : 's'}` : '';
  if (!rows.length) { body.innerHTML = `<p class="cb-meta" style="padding:10px 4px">${CB.q ? 'No client matches that.' : 'No clients in this branch.'}</p>`; return; }
  const tr = rows.map(r => {
    const mail = r.email ? cbEsc(r.email) : `<span class="cb-muted">${r.email_status === 'no email' ? 'none' : 'shared, not theirs'}</span>`;
    return `<tr class="cb-row" tabindex="0" role="button" aria-label="Open ${cbEsc(cbName(r))}" data-b="${cbEsc(r.branch)}" data-i="${cbEsc(r.id)}">
      <td><b>${cbEsc(cbName(r))}</b>${r.archived ? ' <span class="cb-pill">archived</span>' : ''}</td>
      <td>${r.mobile ? cbEsc(r.mobile) : '<span class="cb-muted">none</span>'}</td>
      <td class="hm">${mail}</td>
      <td class="hm">${cbBranches(r.branches) || '<span class="cb-muted">not matched</span>'}</td>
      <td>${r.has_note ? '<span class="cb-pill">client note</span>' : ''}${r.visit_notes ? `<span class="cb-pill">${cbNum(r.visit_notes)} visit note${r.visit_notes === 1 ? '' : 's'}</span>` : ''}</td>
    </tr>`;
  }).join('');
  body.innerHTML = `<table class="cb-t"><tr><th>Name</th><th>Phone</th><th class="hm">Email</th><th class="hm">Branch</th><th>Notes</th></tr>${tr}</table>
    <div class="cb-pager"><button type="button" class="cb-btn" data-pg="-1"${CB.page === 0 ? ' disabled' : ''}>Previous</button>
    <button type="button" class="cb-btn" data-pg="1"${to >= total ? ' disabled' : ''}>Next</button></div>`;
}

async function cbLoad() {
  const body = document.getElementById('cbBody');
  if (!body) return;
  const seq = ++cbSeq;
  try {
    const { data, error } = await sb.rpc('client_book_search', { p_q: CB.q.trim(), p_branch: CB.branch, p_limit: CB_PAGE, p_offset: CB.page * CB_PAGE });
    if (error) throw error;
    if (seq !== cbSeq) return;
    cbData = data;
    cbPaint();
  } catch (e) {
    console.error(e);
    if (seq !== cbSeq) return;
    body.innerHTML = '<p class="cb-meta" style="padding:10px 4px">The client list did not load. Refresh to try again.</p>';
  }
}

function renderClientBook() {
  const el = document.getElementById('clientBookContent');
  if (!el) return;
  if (!cbLevelOk()) { el.innerHTML = '<div class="cb"><p class="cb-meta" style="padding:20px 0">The Client Book is for Level 6 only.</p></div>'; return; }
  el.innerHTML = cbShell();
  cbWire();
  cbOpen = '';
  cbLoad();
}
