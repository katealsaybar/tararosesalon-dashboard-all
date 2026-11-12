// Detailed complaints (Kate, 12 Nov 2026: "detailed complaints report go under Client Complaints"): every complaint on one table with every column, so it can be filtered, sorted and taken into a spreadsheet.
// The rows are the ones Client Complaints reads (Phorest visit notes, the ones staff logged, optionally the undated client card notes) plus the chat complaints Coach Emma or Kate confirmed.
// Levels 3 and up, enforced in every function. It borrows the look and the small helpers of complaints.js and complaint-chats.js (same script group). It sits under Client Complaints in the menu.
const CD = { q: '', src: 'all', branch: 'all', status: 'all', from: '', to: '', cards: false, rows: null, loading: false, sort: 'date', dir: 'desc', page: 0, size: 50, seq: 0 };
const CD_COLS = [['date', 'Date'], ['branch', 'Branch'], ['client', 'Client'], ['kind', 'Kind'], ['what', 'What happened'], ['found', 'Found in'], ['now', 'Where it is now'], ['outcome', 'Outcome'], ['ended', 'How it ended'],
  ['stylist', 'Stylist'], ['services', 'Services that day'], ['fee', 'Charged (AED)'], ['handled', 'Handled by'], ['google', 'Google review'], ['code', 'Code'], ['note', 'Original note']];

function cdNormal(r) {
  return {
    date: r.date ? String(r.date).slice(0, 10) : '', branch: r.branch || '', client: r.client || '', kind: CQ_TYPE[r.type] || r.type || '', what: r.detail || '', found: cqFound(r), now: cqStage(r).text,
    outcome: r.status === 'open' ? 'Still open' : (CQ_RES[r.resolution] || r.resolution || ''), ended: r.resolution_detail || '', stylist: r.stylists || '', services: r.services || '', fee: r.fee == null ? null : Number(r.fee),
    handled: r.handled_by || '', google: r.g_date ? `${String(r.g_date).slice(0, 10)}, ${Number(r.g_stars) || ''} stars` : (r.g_manual ? 'Posted (logged)' : ''), code: r.code || '', note: r.note || '', open: r.status === 'open', chat: false, id: r.id, raw: r
  };
}
function cdNormalChat(r) {
  return { date: String(r.date || '').slice(0, 10), branch: r.branch || '', client: r.client, kind: CQ_TYPE[r.type] || '', what: r.note || '', found: typeof ccChatName === 'function' ? ccChatName(r.chat) : r.chat,
    now: 'Closed, history', outcome: '', ended: '', stylist: '', services: '', fee: null, handled: r.decided_by || '', google: '', code: '', note: r.words || '', open: false, chat: true, id: r.id, raw: r };
}
async function cdLoad() {
  const seq = ++CD.seq; CD.loading = true;
  const meta = document.getElementById('cdMeta');
  const rows = [];
  try {
    for (const src of (CD.cards ? ['visit', 'client'] : ['visit'])) {
      let total = Infinity, off = 0;
      while (off < total && off < 5000) {
        const { data, error } = await sb.rpc('client_complaints_list', { p_branch: 'all', p_src: src, p_type: 'all', p_resolution: 'all', p_q: '', p_low: false, p_limit: 100, p_offset: off, p_sort: 'date', p_dir: 'desc', p_google: 'all', p_status: 'all', p_flag: 'all', p_from: null, p_to: null });
        if (error) throw error;
        if (seq !== CD.seq) return;
        total = Number(data.total || 0);
        const got = data.rows || [];
        rows.push(...got.map(cdNormal));
        if (meta) meta.textContent = `Loading ${cqNum(rows.length)} of ${cqNum(total)}…`;
        if (!got.length) break;
        off += 100;
      }
    }
    try {
      const c = await sb.rpc('complaint_candidates_list', { p_status: 'confirmed', p_chat: 'all', p_q: '' });
      if (!c.error && c.data) rows.push(...(c.data.rows || []).map(cdNormalChat));
    } catch (e) { console.error(e); }
    if (seq !== CD.seq) return;
    CD.rows = rows; CD.loading = false; CD.page = 0;
    cdPaint();
  } catch (e) {
    console.error(e); CD.loading = false;
    const b = document.getElementById('cdBody'); if (b) b.innerHTML = '<p class="cq-meta" style="padding:10px 4px">The complaints did not load. Refresh to try again.</p>';
  }
}
function cdFiltered() {
  if (!CD.rows) return [];
  const q = CD.q.trim().toLowerCase();
  const isClosed = r => !r.open;
  let rows = CD.rows.filter(r => {
    if (CD.src === 'chat' ? !r.chat : (CD.src !== 'all' && r.found !== CD.src)) return false;
    if (CD.branch !== 'all' && r.branch !== CD.branch) return false;
    if (CD.status === 'open' && !r.open) return false;
    if (CD.status === 'closed' && !isClosed(r)) return false;
    if (CD.from && (!r.date || r.date < CD.from)) return false;
    if (CD.to && (!r.date || r.date > CD.to)) return false;
    if (q && !(r.client + ' ' + r.what + ' ' + r.stylist + ' ' + r.services + ' ' + r.note + ' ' + r.code + ' ' + r.found).toLowerCase().includes(q)) return false;
    return true;
  });
  const k = CD.sort, d = CD.dir === 'asc' ? 1 : -1;
  rows = rows.slice().sort((a, b) => {
    const x = a[k] == null ? '' : a[k], y = b[k] == null ? '' : b[k];
    if (typeof x === 'number' || typeof y === 'number') return d * ((Number(x) || 0) - (Number(y) || 0));
    return d * String(x).localeCompare(String(y), 'en', { numeric: true });
  });
  return rows;
}
function cdShell() {
  const branches = ['all'].concat(Object.keys(CQ_BRANCH));
  const srcs = ['Phorest note', 'Phorest client card', 'Logged by staff'].concat((typeof CC_CHATS !== 'undefined' ? CC_CHATS : []).map(c => (typeof ccChatName === 'function' ? ccChatName(c) : c)));
  return cqCss() + `<div class="cq"><div id="cdRec" class="cq-gone"></div><div id="cdMain">
    <h1>Detailed complaints</h1>
    <p class="cq-sub">Every complaint on one table, with every column: what happened, where it was found, where it is now, how it ended, who did the service and whether the client left a Google review. Filter it, sort it, and take it into a spreadsheet. Click a row to open it with her chat and her profile. Levels 3 and up.</p>
    <div class="cq-intro">
      <p><b>What is this?</b>One row per complaint, newest first, from Phorest notes, the ones staff logged and the chat complaints that were confirmed.</p>
      <p><b>Why it matters</b>The archive reads one complaint at a time. This is for the questions that need all of them: which stylist, which service, which branch, how it ended.</p>
      <p><b>Do this now</b><span id="cdDo">Pick a branch or a window, then take the rows with XLSX or CSV.</span></p>
    </div>
    <div id="cdTiles" class="cq-tiles"></div>
    <div class="cq-card">
      <div class="cq-bar cq-filt" style="display:flex">
        <input id="cdQ" class="cq-in" type="search" autocomplete="off" placeholder="Client, stylist, service, code or words in the note" aria-label="Search the complaints" value="${cqEsc(CD.q)}">
        <select id="cdSrc" class="cq-sel" aria-label="Found in"><option value="all">Found in: everywhere</option><option value="chat">Found in: any chat</option>${srcs.map(s => `<option>${cqEsc(s)}</option>`).join('')}</select>
        <select id="cdBr" class="cq-sel" aria-label="Branch">${branches.map(b => `<option value="${b}">${b === 'all' ? 'All branches' : cqEsc(CQ_BRANCH[b])}</option>`).join('')}</select>
        <select id="cdSt" class="cq-sel" aria-label="Where it is now"><option value="all">Status: any</option><option value="open">Still open</option><option value="closed">Closed</option></select>
        <label class="cq-chk">From <input id="cdFrom" type="date" class="cq-sel" aria-label="From the date"></label>
        <label class="cq-chk">to <input id="cdTo" type="date" class="cq-sel" aria-label="To the date"></label>
        <label class="cq-chk"><input id="cdCards" type="checkbox"> Include client card notes (undated)</label>
      </div>
      <div class="cq-metarow"><p class="cq-meta" id="cdMeta" aria-live="polite">Loading…</p><span class="cq-sheetwrap">${typeof rexButtons === 'function' ? rexButtons('cdExport') : ''}</span></div>
      <div id="cdBody" class="cd-scroll"><p class="cq-meta">Loading…</p></div>
    </div>
    <p class="cq-foot">How to read it. Each row is a complaint. Found in says where it was first written down; Where it is now is the pipeline stage, and notes from Phorest were written after the fact so they are Closed, history. Charged is what the visit cost that day, not a refund. A complaint found only in a chat is added once Coach Emma or Kate confirm it in Chat complaints review, and has no stylist or service because the chat does not say.</p>
  </div></div>`;
}
function cdPaint() {
  const rows = cdFiltered(), meta = document.getElementById('cdMeta'), body = document.getElementById('cdBody'); if (!body || !CD.rows) return;
  const open = CD.rows.filter(r => r.open).length, chat = CD.rows.filter(r => r.chat).length;
  const tiles = document.getElementById('cdTiles');
  if (tiles) tiles.innerHTML = [['all', CD.rows.length, 'All complaints', 'every row'], ['open', open, 'Still open', 'logged and not closed'], ['closed', CD.rows.length - open, 'Closed', 'including history'], ['chat', chat, 'Found in a chat', 'confirmed']]
    .map(([k, n, l, s]) => `<button type="button" class="cq-tile cq-tilebtn" data-cdtile="${k}" title="Opens the rows behind this number"><b>${cqNum(n)}</b><span>${cqEsc(l)}</span><span class="cq-muted">${cqEsc(s)}</span></button>`).join('');
  const pages = Math.max(1, Math.ceil(rows.length / CD.size)); CD.page = Math.min(CD.page, pages - 1);
  const from = rows.length ? CD.page * CD.size + 1 : 0, to = Math.min(rows.length, (CD.page + 1) * CD.size);
  if (meta) meta.textContent = rows.length ? `${cqNum(from)} to ${cqNum(to)} of ${cqNum(rows.length)} complaint${rows.length === 1 ? '' : 's'}` : '';
  if (!rows.length) { body.innerHTML = '<p class="cq-meta" style="padding:10px 4px">No complaint matches that.</p>'; return; }
  const th = ([k, l]) => `<th class="cq-sort${k === 'fee' ? ' n' : ''}" tabindex="0" role="columnheader button" data-cdsort="${k}"${CD.sort === k ? ` aria-sort="${CD.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${l}<span class="ar" aria-hidden="true">${CD.sort === k ? (CD.dir === 'asc' ? '▲' : '▼') : '↕'}</span></th>`;
  const td = (r, k) => k === 'fee' ? `<td class="n">${r.fee == null ? '' : cqNum(r.fee)}</td>`
    : k === 'date' ? `<td style="white-space:nowrap">${r.date ? cqEsc(cqDay(r.date)) : 'Client card'}</td>`
    : k === 'branch' ? `<td>${cqEsc(r.branch)}</td>`
    : k === 'code' && r.code ? `<td style="white-space:nowrap"><a href="/hub/complaint?c=${encodeURIComponent(r.code)}" target="_blank" rel="noopener">${cqEsc(r.code)}</a></td>`
    : k === 'what' || k === 'note' || k === 'ended' || k === 'services' ? `<td class="cd-wide" dir="auto">${cqEsc(r[k])}</td>` : `<td>${cqEsc(r[k])}</td>`;
  body.innerHTML = `<table class="cq-t cd-t"><tr>${CD_COLS.map(th).join('')}</tr>${rows.slice(CD.page * CD.size, (CD.page + 1) * CD.size).map(r => `<tr class="cq-row" tabindex="0" data-cdrow="${cdKey(r)}" title="Open this complaint">${CD_COLS.map(([k]) => td(r, k)).join('')}</tr>`).join('')}</table>
    <div class="cq-pager"><button type="button" class="cq-btn" data-cdpg="-1"${CD.page === 0 ? ' disabled' : ''}>Previous</button><span class="cq-meta" style="margin:0 8px">Page ${CD.page + 1} of ${pages}</span><button type="button" class="cq-btn" data-cdpg="1"${CD.page >= pages - 1 ? ' disabled' : ''}>Next</button></div>`;
}
function cdExport() {
  const rows = cdFiltered(); if (!rows.length) return null;
  const cols = CD_COLS.map(([key, label]) => ({ key, label, fmt: key === 'fee' ? 'aed' : 'text' }));
  const out = rows.map(r => ({ cells: CD_COLS.map(([k]) => k === 'fee' ? (r.fee == null ? null : r.fee) : k === 'branch' ? (r.branch ? cqBr(r.branch) : '') : (r[k] == null ? '' : r[k])) }));
  return { name: 'detailed-complaints', sheets: [{ name: 'Complaints', title: 'Detailed complaints', subtitle: `${out.length} complaint${out.length === 1 ? '' : 's'}, with the filters set on the page`, blocks: [{ cols, rows: out }],
    legend: [['Found in', 'Where the complaint was first written down.'], ['Where it is now', 'The pipeline stage. Notes from Phorest were written after the fact, so they are Closed, history.'], ['Charged (AED)', 'What the visit cost that day, not a refund.']] }] };
}
window.cdExport = cdExport;
// A row opens its record (Kate, 13 Nov 2026: "why not clickable tho"). The same three tabs as the archive and the chat review: Complaint (every column of the row), Conversation (her chat in respond.io)
// and Client profile (who she is in Phorest), through the same helpers and the same read-only functions. Back returns to the same place in the table, and the arrows go through the filtered table.
const cdKey = r => (r.chat ? 'c' : 'v') + r.id;
const cdByKey = k => (CD.rows || []).find(r => cdKey(r) === k);
let cdBackY = 0, cdOpenKey = '', cdTab = 'complaint', cdCtx = [];
function cdFieldsHtml(r) {
  const rows = [['Date', r.date ? cqDay(r.date) : 'Client card'], ['Branch', r.branch ? cqBr(r.branch) : ''], ['Client', r.client], ['Kind', r.kind], [r.chat ? 'Note' : 'What happened', r.what], ['Found in', r.found], ['Where it is now', r.now],
    ['Outcome', r.outcome], ['How it ended', r.ended], ['Stylist', r.stylist], ['Services that day', r.services], ['Charged (AED)', r.fee == null ? '' : cqNum(r.fee)], ['Handled by', r.handled], ['Google review', r.google], [r.chat ? 'Their words' : 'Original note', r.note]];
  const code = r.code ? `<p class="cq-kv"><span>Code</span> <a href="/hub/complaint?c=${encodeURIComponent(r.code)}" target="_blank" rel="noopener">${cqEsc(r.code)}</a> <span>(the ticket page opens in a new window)</span></p>` : '';
  return rows.filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<p class="cq-kv" style="white-space:pre-wrap" dir="auto"><span>${k}</span> ${cqEsc(v)}</p>`).join('') + code;
}
function cdRecOpen(key) {
  const r = cdByKey(key), rec = document.getElementById('cdRec'), main = document.getElementById('cdMain');
  if (!r || !rec || !main) return;
  if (!main.classList.contains('cq-gone')) { cdBackY = window.scrollY; cdCtx = cdFiltered().map(cdKey); }
  const i = cdCtx.indexOf(key);
  cdOpenKey = key; cdTab = 'complaint'; cqCacheOf(-1).wide = false;
  rec.innerHTML = `<div class="cq-recbar"><button type="button" class="cq-btn" data-cdback="1">&larr; Back to the table</button>
      <span class="cq-recpos">${i >= 0 ? `${i + 1} of ${cdCtx.length} in this table ` : ''}<button type="button" class="cq-btn" data-cdnav="-1" aria-label="Previous complaint"${i <= 0 ? ' disabled' : ''}>&lsaquo;</button><button type="button" class="cq-btn" data-cdnav="1" aria-label="Next complaint"${i < 0 || i >= cdCtx.length - 1 ? ' disabled' : ''}>&rsaquo;</button></span></div>
    <div class="cq-card cq-recbox">
      <h2 class="cq-rectitle">${cqEsc(cqMDY(r.date))} | ${cqEsc(r.branch || '')} | ${cqEsc(r.client || 'No name')} | ${cqEsc(r.kind || 'Unclear')}</h2>
      <div class="cq-recchips"><span class="cq-ch grey">${cqEsc(r.found)}</span><span class="cq-ch grey">${cqEsc(r.now)}</span></div>
      <div class="cq-tabs" role="tablist">${[['complaint', 'Complaint'], ['chat', 'Conversation'], ['client', 'Client profile']].map(([k, l], n) => `<button type="button" role="tab" class="cq-tab${n ? '' : ' on'}" data-cdtab="${k}">${l}</button>`).join('')}</div>
      <div id="cdTabBody"></div>
    </div>`;
  main.classList.add('cq-gone'); rec.classList.remove('cq-gone');
  window.scrollTo(0, 0);
  cdTabShow('complaint');
}
function cdRecClose() {
  const rec = document.getElementById('cdRec'), main = document.getElementById('cdMain');
  if (!rec || !main || rec.classList.contains('cq-gone')) return;
  rec.classList.add('cq-gone'); rec.innerHTML = ''; main.classList.remove('cq-gone'); cdOpenKey = '';
  window.scrollTo(0, cdBackY);
}
function cdRecNav(d) { const i = cdCtx.indexOf(cdOpenKey), n = cdCtx[i + d]; if (i >= 0 && n) cdRecOpen(n); }
async function cdTabShow(tab) {
  const box = document.getElementById('cdTabBody'), r = cdByKey(cdOpenKey), key = cdOpenKey;
  if (!box || !r) return;
  cdTab = tab;
  document.querySelectorAll('#cdRec .cq-tab').forEach(b => b.classList.toggle('on', b.dataset.cdtab === tab));
  if (tab === 'complaint') { box.innerHTML = cdFieldsHtml(r); return; }
  box.innerHTML = '<p class="cq-meta" style="padding:8px 2px">Loading…</p>';
  const live = () => cdTab === tab && cdOpenKey === key, raw = r.raw;
  if (typeof cqProfile !== 'function' || (r.chat && typeof ccChat !== 'function')) { box.innerHTML = '<p class="cq-meta">This did not load. Refresh the page and try again.</p>'; return; }
  if (tab === 'client') {
    const c = r.chat ? ccCache[raw.id] : cqCacheOf(raw.id); if (c && c.err) { delete c.profile; c.err = false; }
    const p = r.chat ? await ccProfile(raw.id) : await cqProfile(raw.id);
    if (live()) box.innerHTML = cqProfileHtml({ client: r.client }, p);
  } else {
    const chat = r.chat ? await ccChat(raw) : await cqChat(raw);
    if (live()) box.innerHTML = r.chat ? ccChatHtml(raw, chat) : cqChatHtml(raw, chat);
  }
}
function cdRecClick(e) {
  const t = e.target, g = s => t.closest && t.closest(s); let x;
  if (g('[data-cdback]')) { cdRecClose(); return true; }
  if ((x = g('[data-cdnav]'))) { cdRecNav(Number(x.dataset.cdnav)); return true; }
  if ((x = g('[data-cdtab]'))) { cdTabShow(x.dataset.cdtab); return true; }
  if ((x = g('[data-cqgo]'))) { const el = document.getElementById(x.dataset.cqgo); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
  const r = cdByKey(cdOpenKey); if (!r) return false;
  if ((x = g('[data-cqwide]'))) { const c = cqCacheOf(Number(x.dataset.cqwide)); c.wide = !c.wide; cdTabShow('chat'); return true; }
  if (g('[data-cqretry]')) { delete cqCacheOf(r.raw.id).chat; cdTabShow('chat'); return true; }
  if (g('[data-ccretry]') && ccCache[r.raw.id]) { delete ccCache[r.raw.id].chat; cdTabShow('chat'); return true; }
  if ((x = g('[data-cqyes]'))) { cqChatLink(r.raw.id, Number(x.dataset.cqyes)).then(ok => { if (ok) cdTabShow('chat'); }); return true; }
  if ((x = g('[data-cqno]'))) { cqCacheOf(r.raw.id).skip.push(Number(x.dataset.cqno)); cdTabShow('chat'); return true; }
  if (g('[data-cqunlink]')) { cqChatLink(r.raw.id, null).then(ok => { if (ok) cdTabShow('chat'); }); return true; }
  if ((x = g('[data-ccyes]'))) { ccChat(r.raw, Number(x.dataset.ccyes)).then(() => cdTabShow('chat')); return true; }
  return false;
}
function cdWire() {
  const root = document.getElementById('complaintsDetailContent'); if (!root) return;
  const set = (id, k, ev) => { const el = document.getElementById(id); if (el) el.addEventListener(ev || 'change', () => { CD[k] = el.type === 'checkbox' ? el.checked : el.value; CD.page = 0; if (k === 'cards') cdLoad(); else cdPaint(); }); };
  set('cdQ', 'q', 'input'); set('cdSrc', 'src'); set('cdBr', 'branch'); set('cdSt', 'status'); set('cdFrom', 'from'); set('cdTo', 'to'); set('cdCards', 'cards');
  if (root.dataset.w) return;
  root.dataset.w = '1';
  root.addEventListener('click', e => {
    if (cdRecClick(e)) return;
    const t = e.target, g = s => t.closest && t.closest(s); let x;
    if ((x = g('[data-cdsort]'))) { const k = x.dataset.cdsort; if (CD.sort === k) CD.dir = CD.dir === 'asc' ? 'desc' : 'asc'; else { CD.sort = k; CD.dir = (k === 'date' ? 'desc' : 'asc'); } cdPaint(); return; }
    if ((x = g('[data-cdpg]'))) { CD.page = Math.max(0, CD.page + Number(x.dataset.cdpg)); cdPaint(); const b = document.getElementById('cdBody'); if (b) b.scrollTop = 0; return; }
    if ((x = g('[data-cdtile]'))) {
      const k = x.dataset.cdtile; CD.src = k === 'chat' ? 'chat' : 'all'; CD.status = (k === 'open' || k === 'closed') ? k : 'all'; CD.page = 0;
      ['cdSrc', 'cdSt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'cdSrc' ? CD.src : CD.status; });
      cdPaint(); return;
    }
    if ((x = g('tr.cq-row')) && !g('a')) { cdRecOpen(x.dataset.cdrow); return; }
  });
  root.addEventListener('keydown', e => { const row = e.target.closest && e.target.closest('tr.cq-row'); if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); cdRecOpen(row.dataset.cdrow); } });
  if (!window.cdEscWired) { window.cdEscWired = true; document.addEventListener('keydown', e => { if (e.key === 'Escape' && cdOpenKey && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) cdRecClose(); }); }
}
function renderComplaintsDetail() {
  const el = document.getElementById('complaintsDetailContent'); if (!el) return;
  if (!cqLevelOk('complaintsdetail')) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Detailed complaints is for Levels 3 and up.</p></div>'; return; }
  el.innerHTML = cdShell();
  cdWire();
  cdLoad();
}
