// Chat complaints review (Kate, 12 Nov 2026): the people who wrote complaint-like messages to the salon in WhatsApp, Instagram or Facebook and who are not on Client Complaints yet.
// The respond.io traceback found them (migrations/complaint_candidates.sql holds the rows); Coach Emma and Kate decide each one: Confirm complaint, Not a complaint, Already in dashboard, Unsure.
// Levels 3 and up, enforced in every function. A decision changes only this list: nothing is sent to a client and nobody is alerted. It sits under Client Complaints in the menu.
// It borrows the look and the small helpers of complaints.js (same script group), and opens one chat in its own view, like the complaints archive does.
const CC = { status: 'todo', chat: 'all', q: '', rows: [], counts: null, open: 0, tab: 'words', ctx: [], msg: '' };
const CC_CHATS = ['SAA', 'KCA', 'MC', 'AQ', 'Brand number', 'Instagram', 'Facebook'];
const CC_LABEL = { todo: 'To decide', confirmed: 'Confirmed, closed history', not: 'Not a complaint', already: 'Already in dashboard', unsure: 'Unsure, second look' };
const CC_TONE = { todo: 'amber', confirmed: 'green', not: 'grey', already: 'grey', unsure: 'amber' };
let ccBackY = 0;
const ccCache = {};
const ccRow = id => CC.rows.find(r => r.id === id);
const ccChatName = c => (c === 'Instagram' || c === 'Facebook') ? c : (c === 'Brand number' ? 'WhatsApp Brand number' : 'WhatsApp ' + c);
const ccChatKey = c => (c === 'Instagram' ? 'Instagram' : c === 'Facebook' ? 'Facebook' : 'WhatsApp');
const ccDate = r => String(r.date || '').slice(0, 10);
const ccPri = r => r.status !== 'todo' ? 'low' : (r.health ? 'high' : (r.confidence === 'likely' ? 'mid' : 'low'));
const ccTitle = r => `${cqEsc(cqMDY(ccDate(r)))} | ${cqEsc(r.branch || 'Branch not known')} | ${cqEsc(r.client)} | ${cqEsc(CQ_TYPE[r.type] || 'Unclear')}`;

function ccFiltered() {
  const q = CC.q.trim().toLowerCase();
  return CC.rows.filter(r => (CC.status === 'all' || r.status === CC.status) && (CC.chat === 'all' || r.chat === CC.chat)
    && (!q || (r.client + ' ' + (r.note || '') + ' ' + (r.words || '') + ' ' + (r.phone || '')).toLowerCase().includes(q)));
}
function ccCounts() {
  const c = { total: CC.rows.length, todo: 0, confirmed: 0, not: 0, already: 0, unsure: 0 };
  CC.rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}

function ccShell() {
  const copts = ['<option value="all">Found in: every chat</option>'].concat(CC_CHATS.map(c => `<option value="${cqEsc(c)}">${cqEsc(ccChatName(c))}</option>`)).join('');
  return cqCss() + `<div class="cq">
    <h1>Chat complaints review</h1>
    <p class="cq-sub">Clients who wrote to us in a chat in a way that sounds like a complaint, and who are not on Client Complaints yet. Found by reading the chats in respond.io, 3 Aug to 12 Nov 2026. Levels 3 and up.</p>
    <div id="ccRec" class="cq-gone"></div>
    <div id="ccMain">
      <div class="cq-intro">
        <p><b>What is this?</b>The chats that sound like a complaint. Each one is a person, the words she wrote, and the chat around it.</p>
        <p><b>Why it matters</b>A client who only complained in a chat never reached Phorest, so nobody logged it, and we lose her quietly.</p>
        <p><b>Do this now</b><span id="ccDo">Loading…</span></p>
      </div>
      <div id="ccTiles" class="cq-tiles"></div>
      <div class="cq-card" id="ccList">
        <div class="cq-bar cq-filt" style="display:flex">
          <input id="ccQ" class="cq-in" type="search" autocomplete="off" placeholder="Name, number or words in the chat" aria-label="Search the chats" value="${cqEsc(CC.q)}">
          <select id="ccC" class="cq-sel" aria-label="Found in">${copts}</select>
          <select id="ccS" class="cq-sel" aria-label="Where it is now"><option value="all">Everything</option><option value="todo">To decide</option><option value="confirmed">Confirmed</option><option value="not">Not a complaint</option><option value="already">Already in dashboard</option><option value="unsure">Unsure</option></select>
        </div>
        <div class="cq-metarow"><p class="cq-meta" id="ccMeta" aria-live="polite"></p><span class="cq-sheetwrap">${typeof rexButtons === 'function' ? rexButtons('ccExport') : ''}</span></div>
        <div id="ccBody" style="overflow-x:auto"><p class="cq-meta">Loading…</p></div>
      </div>
      <p class="cq-foot">How to read it. The words are the first message that matched, which is sometimes a staff message copied into the chat, so look at the conversation before you decide. Likely means the words are a clear complaint, Maybe means it needs your eyes, and the red mark means skin, scalp, allergy, burn or infection wording: look at those first. Confirm complaint saves it as a complaint found in a chat; nothing is sent to the client and nobody is alerted. It can miss complaints that use none of the words the search looked for, and it only sees messages sent to the salon's own numbers.</p>
    </div>
  </div>`;
}

function ccPaintTiles() {
  const el = document.getElementById('ccTiles'); if (!el) return;
  const c = ccCounts(), dec = c.confirmed + c.not + c.already, real = c.confirmed + c.already;
  const T = [['todo', c.todo, 'To decide', 'chats waiting'], ['confirmed', c.confirmed, 'Confirmed', 'real complaints, only in chats'], ['not', c.not, 'Not a complaint', 'kept so we know what to ignore'],
    ['already', c.already, 'Already in dashboard', 'on Client Complaints'], ['unsure', c.unsure, 'Unsure', 'needs a second look'], ['all', dec ? Math.round(100 * real / dec) + '%' : 'No data yet', 'Hit rate', dec ? real + ' of ' + dec + ' decided were real' : 'fills in as you review']];
  el.innerHTML = T.map(([k, n, l, s]) => `<button type="button" class="cq-tile cq-tilebtn${CC.status === k && k !== 'all' ? ' on' : ''}" data-ccstat="${k}" title="Opens the chats behind this number"><b>${n}</b><span>${cqEsc(l)}</span><span class="cq-muted">${cqEsc(s)}</span></button>`).join('');
  const d = document.getElementById('ccDo');
  if (d) d.innerHTML = c.todo ? `Open the <button type="button" class="cq-link" data-ccstat="todo">${c.todo} chat${c.todo === 1 ? '' : 's'} waiting</button>. About 1 minute each, red ones first.` : 'Nothing is waiting. Every chat has a decision.';
}
function ccPaintList() {
  const body = document.getElementById('ccBody'), meta = document.getElementById('ccMeta'); if (!body) return;
  const rows = ccFiltered();
  if (meta) meta.textContent = `${cqNum(rows.length)} of ${cqNum(CC.rows.length)} chat${CC.rows.length === 1 ? '' : 's'}`;
  if (!rows.length) { body.innerHTML = '<p class="cq-meta" style="padding:10px 4px">No chat matches that.</p>'; return; }
  body.innerHTML = `<table class="cq-t cq-arc"><tr><th>Complaint</th><th class="hm">Found in</th><th>Where it is now</th></tr>${rows.map(r => `<tr class="cq-row p-${ccPri(r)}" tabindex="0" role="button" aria-label="Open this chat" data-i="${r.id}">
      <td><span class="cq-nm">${ccTitle(r)}</span><span class="cq-qt" dir="auto">${cqEsc(r.words || r.note || '')}</span></td>
      <td class="hm"><span class="cq-ch ${ccChatKey(r.chat)}">${cqEsc(ccChatName(r.chat))}</span> <span class="cq-ch grey">${r.confidence === 'likely' ? 'Likely' : 'Maybe'}</span>${r.health ? ' <span class="cq-ch red">Health</span>' : ''}</td>
      <td><span class="cq-ch ${CC_TONE[r.status]}">${cqEsc(CC_LABEL[r.status])}</span></td></tr>`).join('')}</table>`;
}
function ccPaint() { ccPaintTiles(); ccPaintList(); }

// ── the chat in its own view ──
function ccPipe(r) {
  const i = r.status === 'todo' ? 1 : (r.status === 'unsure' ? 1 : 2);
  const names = ['Found in a chat', 'Decision', r.status === 'confirmed' ? 'Closed, history' : r.status === 'not' ? 'Not a complaint' : r.status === 'already' ? 'In dashboard' : 'Decided'];
  return `<div class="cq-pipe" style="grid-template-columns:repeat(3,minmax(0,1fr))" role="img" aria-label="Stage: ${cqEsc(names[i])}">${names.map((g, k) => `<div class="cq-stg${k < i ? ' done' : k === i ? ' cur' : ''}">${k < i ? '&#10003; ' : ''}${cqEsc(g)}<small>${k === 0 ? cqEsc(ccChatName(r.chat).toLowerCase()) : k === 1 && r.status === 'unsure' ? 'unsure' : k === 1 && r.status === 'todo' ? 'to decide' : ''}</small></div>`).join('')}</div>`;
}
function ccRecOpen(id) {
  const r = ccRow(id), rec = document.getElementById('ccRec'), main = document.getElementById('ccMain'); if (!r || !rec || !main) return;
  if (!main.classList.contains('cq-gone')) { ccBackY = window.scrollY; CC.ctx = ccFiltered().map(x => x.id); }
  const i = CC.ctx.indexOf(id);
  CC.open = id; CC.tab = 'words'; cqCacheOf(-1).wide = false;
  const pos = i >= 0 ? `${i + 1} of ${CC.ctx.length} in this list` : '';
  rec.innerHTML = `<div class="cq-recbar"><button type="button" class="cq-btn" data-ccback="1">&larr; Back to the list</button>
      <span class="cq-recpos">${pos} <button type="button" class="cq-btn" data-ccnav="-1" aria-label="Previous chat"${i <= 0 ? ' disabled' : ''}>&lsaquo;</button><button type="button" class="cq-btn" data-ccnav="1" aria-label="Next chat"${i < 0 || i >= CC.ctx.length - 1 ? ' disabled' : ''}>&rsaquo;</button></span></div>
    <div id="ccMsg"></div>
    <div class="cq-recgrid">
      <div class="cq-card cq-recbox" style="max-width:none">
        <h2 class="cq-rectitle">${ccTitle(r)}</h2>
        <div class="cq-recchips"><span class="cq-ch ${ccChatKey(r.chat)}">${cqEsc(ccChatName(r.chat))}</span><span class="cq-ch grey">${r.confidence === 'likely' ? 'Likely' : 'Maybe'}</span>${r.health ? '<span class="cq-ch red">Health: look first</span>' : ''}<span class="cq-ch ${CC_TONE[r.status]}">${cqEsc(CC_LABEL[r.status])}</span></div>
        ${ccPipe(r)}
        <div class="cq-tabs" role="tablist">${[['words', 'Their words'], ['chat', 'Conversation'], ['client', 'Client profile']].map(([k, l], n) => `<button type="button" role="tab" class="cq-tab${n ? '' : ' on'}" data-cctab="${k}">${l}</button>`).join('')}</div>
        <div id="ccTabBody">${ccWordsHtml(r)}</div>
      </div>
      <div class="cq-card cq-recbox cq-decide" id="ccDecide">${ccDecideHtml(r)}</div>
    </div>`;
  main.classList.add('cq-gone'); rec.classList.remove('cq-gone');
  window.scrollTo(0, 0);
}
function ccRecClose() {
  const rec = document.getElementById('ccRec'), main = document.getElementById('ccMain'); if (!rec || !main || rec.classList.contains('cq-gone')) return;
  rec.classList.add('cq-gone'); rec.innerHTML = ''; main.classList.remove('cq-gone'); CC.open = 0;
  ccPaint(); window.scrollTo(0, ccBackY);
}
function ccRecNav(d) { const i = CC.ctx.indexOf(CC.open), n = CC.ctx[i + d]; if (i >= 0 && n) ccRecOpen(n); }
function ccWordsHtml(r) {
  return `<p class="cq-note">What she wrote in the chat, as found by the search. Check the conversation before you decide.</p>
    <div class="cq-orig" dir="auto">${cqText(r.words || 'No words kept.')}</div>
    <div class="cq-grid" style="margin-top:12px"><div>
      <p class="cq-kv"><span>Chat</span> ${cqEsc(ccChatName(r.chat))}</p>
      <p class="cq-kv"><span>Date</span> ${cqEsc(cqDay(ccDate(r)))}</p>
      <p class="cq-kv"><span>Branch</span> ${r.branch ? cqEsc(cqBr(r.branch)) : '<span class="cq-muted">Not known</span>'}</p></div><div>
      <p class="cq-kv"><span>Short note</span> ${cqEsc(r.note || 'None')}</p>
      <p class="cq-kv"><span>Suggested kind</span> ${cqEsc(CQ_TYPE[r.suggested] || 'Unclear')}</p>
      ${r.code ? `<p class="cq-kv"><span>Code</span> ${cqEsc(r.code)}</p>` : ''}
      ${r.decided_by ? `<p class="cq-kv"><span>Decided by</span> ${cqEsc(r.decided_by)}${r.decided_at ? ' on ' + cqEsc(cqDubai(r.decided_at)) : ''}</p>` : ''}</div></div>`;
}
function ccDecideHtml(r) {
  const opts = Object.keys(CQ_TYPE).map(k => `<option value="${k}"${k === r.type ? ' selected' : ''}>${cqEsc(CQ_TYPE[k])}</option>`).join('');
  const done = r.status !== 'todo';
  return `<div class="cq-eye">What kind of complaint</div>
    <select id="ccType" class="cq-sel" style="width:100%;margin-bottom:12px" aria-label="Kind of complaint">${opts}</select>
    <div class="cq-eye">${done ? 'Decision: ' + cqEsc(CC_LABEL[r.status]) : 'Your decision'}</div>
    <div class="cq-acts">
      <button type="button" class="cq-act pri${r.status === 'confirmed' ? ' cur' : ''}" data-ccdo="confirmed">Confirm complaint <kbd>C</kbd></button>
      <button type="button" class="cq-act${r.status === 'not' ? ' cur' : ''}" data-ccdo="not">Not a complaint <kbd>N</kbd></button>
      <button type="button" class="cq-act${r.status === 'already' ? ' cur' : ''}" data-ccdo="already">Already in dashboard <kbd>A</kbd></button>
      <button type="button" class="cq-act${r.status === 'unsure' ? ' cur' : ''}" data-ccdo="unsure">Unsure <kbd>U</kbd></button>
    </div>
    <div id="ccLinkBox"></div>
    ${done ? '<button type="button" class="cq-btn" style="margin-top:10px" data-ccdo="todo">Put it back to decide</button>' : ''}
    <p class="cq-note" style="margin-top:10px">Nothing is sent to the client and nobody is alerted.${r.link_code ? ' Linked to ' + cqEsc(r.link_code) + '.' : ''}</p>`;
}

async function ccProfile(id) {
  const c = ccCache[id] = ccCache[id] || {};
  if (c.profile !== undefined) return c.profile;
  try { const { data, error } = await sb.rpc('complaint_candidate_profile', { p_id: id }); if (error) throw error; c.profile = data || null; } catch (e) { console.error(e); c.profile = null; c.err = true; }
  return c.profile;
}
async function ccChat(r, contact) {
  const c = ccCache[r.id] = ccCache[r.id] || {};
  if (c.chat && !contact) return c.chat;
  try {
    const body = { phone: r.phone || '', name: r.client, date: ccDate(r), words: r.words || '' }; if (contact) body.contact_id = contact;
    const { data, error } = await sb.functions.invoke('complaint-chat', { body });
    if (error) throw error; if (data && data.error) throw new Error(data.error);
    c.chat = data || { status: 'none' };
  } catch (e) { console.error(e); c.chat = { status: 'error' }; }
  return c.chat;
}
function ccChatHtml(r, chat) {
  const note = '<p class="cq-note">Her chat in respond.io around the day. Nothing here can be sent. Replies are made in respond.io.</p>';
  if (chat.status === 'error') return note + `<p class="cq-meta">The chat did not load. <button type="button" class="cq-link" data-ccretry="1">Try again</button></p>`;
  if (chat.status === 'none') return note + '<div class="cq-box">No chat found. We searched by phone and by name in respond.io.</div>';
  if (chat.status === 'possible') {
    return note + '<div class="cq-eye">Is this her in respond.io?</div>' + (chat.candidates || []).map(x => `<div class="cq-box cq-cand"><div><b>${cqEsc(x.name || 'No name')}</b>${x.phone ? ', ' + cqEsc(x.phone) : ', no phone number'}${(x.tags || []).length ? '<div class="cq-sub2">' + (x.tags || []).slice(0, 5).map(cqEsc).join(', ') + '</div>' : ''}<div class="cq-sub2">Matched by name only.</div></div>
      <div class="cq-seq"><button type="button" class="cq-btn" data-ccyes="${x.id}">Yes, this is her</button></div></div>`).join('');
  }
  return cqChatHtml({ id: -1 }, chat);   // the found state: the same chat panel as a complaint's Conversation tab
}
async function ccTabShow(tab) {
  const box = document.getElementById('ccTabBody'), r = ccRow(CC.open); if (!box || !r) return;
  CC.tab = tab;
  document.querySelectorAll('#ccRec .cq-tab').forEach(b => b.classList.toggle('on', b.dataset.cctab === tab));
  if (tab === 'words') { box.innerHTML = ccWordsHtml(r); return; }
  box.innerHTML = '<p class="cq-meta" style="padding:8px 2px">Loading…</p>';
  if (tab === 'client') {
    const c = ccCache[r.id]; if (c && c.err) { delete c.profile; c.err = false; }
    const p = await ccProfile(r.id);
    if (CC.tab === 'client' && CC.open === r.id) box.innerHTML = cqProfileHtml({ client: r.client }, p);
  } else {
    const chat = await ccChat(r);
    if (CC.tab === 'chat' && CC.open === r.id) box.innerHTML = ccChatHtml(r, chat);
  }
}

async function ccDecide(status, link) {
  const r = ccRow(CC.open); if (!r) return;
  const sel = document.getElementById('ccType'), type = sel ? sel.value : r.type;
  if (status === 'already' && !link) { ccAlready(r); return; }
  const msg = document.getElementById('ccMsg');
  const { error } = await sb.rpc('complaint_candidate_decide', { p_id: r.id, p_status: status, p_type: status === 'confirmed' ? type : null, p_link: status === 'already' ? link : null });
  if (error) { console.error(error); if (msg) msg.innerHTML = '<div class="cq-box">That did not save. Try again.</div>'; return; }
  r.status = status; r.type = status === 'confirmed' ? type : r.type; r.link_id = status === 'already' ? link : null;
  r.decided_by = status === 'todo' ? null : 'you'; r.decided_at = status === 'todo' ? null : new Date().toISOString();
  const T = { confirmed: 'Confirmed. Saved as a complaint found in a chat. Nobody was alerted.', not: 'Marked not a complaint. We keep it so we know what to ignore.', already: 'Linked to the complaint already in the dashboard.', unsure: 'Kept as unsure for a second look.', todo: 'Put back to decide.' };
  CC.msg = T[status];
  // In the To decide list the next one opens by itself; anywhere else the chat stays on screen with its new state.
  if (CC.status === 'todo' && status !== 'todo') {
    const i = CC.ctx.indexOf(r.id); CC.ctx.splice(i, 1);
    if (CC.ctx.length) { ccRecOpen(CC.ctx[Math.min(i, CC.ctx.length - 1)]); } else { ccRecClose(); }
  } else ccRecOpen(r.id);
  const m = document.getElementById('ccMsg'); if (m && CC.msg) m.innerHTML = `<div class="cq-toast">${cqEsc(CC.msg)}</div>`;
  ccPaintTiles();
}
async function ccAlready(r) {
  const box = document.getElementById('ccLinkBox'); if (!box) return;
  box.innerHTML = '<p class="cq-meta">Looking for her complaints…</p>';
  const p = await ccProfile(r.id);
  const t0 = Date.parse(ccDate(r));
  const near = ((p && p.others) || []).filter(o => o.date && Math.abs(Date.parse(String(o.date).slice(0, 10)) - t0) <= 45 * 86400000);
  if (near.length === 1) { ccDecide('already', near[0].id); return; }
  if (!near.length) { box.innerHTML = '<div class="cq-box">No complaint of hers on the list within 45 days of this chat. If it is real, use Confirm complaint.</div>'; return; }
  box.innerHTML = '<div class="cq-eye" style="margin-top:10px">Which one is it?</div>' + near.map(o => `<div class="cq-box cq-cand"><div>${cqEsc(cqDay(o.date))}, ${cqEsc(CQ_TYPE[o.type] || o.type || 'Unclear')}${o.code ? ' <span class="cq-muted">' + cqEsc(o.code) + '</span>' : ''}</div><div class="cq-seq"><button type="button" class="cq-btn" data-cclink="${o.id}">This one</button></div></div>`).join('');
}

function ccExport() {
  const rows = ccFiltered(); if (!rows.length) return null;
  const cols = [['date', 'Date of the chat'], ['chat', 'Chat'], ['branch', 'Branch'], ['client', 'Client'], ['phone', 'Mobile'], ['conf', 'Confidence'], ['health', 'Health wording'], ['words', 'Their words'], ['note', 'Short note'],
    ['sug', 'Suggested kind'], ['now', 'Decision'], ['kind', 'Kind decided'], ['by', 'Decided by'], ['link', 'Linked complaint']].map(([key, label]) => ({ key, label, fmt: 'text' }));
  const out = rows.map(r => ({ cells: [ccDate(r), ccChatName(r.chat), r.branch ? cqBr(r.branch) : '', r.client, r.phone || '', r.confidence === 'likely' ? 'Likely' : 'Maybe', r.health ? 'Yes' : '', r.words || '', r.note || '',
    CQ_TYPE[r.suggested] || '', CC_LABEL[r.status], r.status === 'confirmed' ? (CQ_TYPE[r.type] || '') : '', r.decided_by || '', r.link_code || ''] }));
  return { name: 'chat-complaints-review', sheets: [{ name: 'Chat complaints', title: 'Chat complaints review', subtitle: `${out.length} chat${out.length === 1 ? '' : 's'}, with the filters set on the page. Internal: names and numbers.`, blocks: [{ cols, rows: out }],
    legend: [['Confidence', 'Likely: a clear complaint in her own words. Maybe: needs a person.'], ['Decision', 'What Coach Emma or Kate decided. To decide means nobody has yet.']] }] };
}
window.ccExport = ccExport;

function ccWire() {
  const main = document.getElementById('ccMain'), rec = document.getElementById('ccRec'); if (!main) return;
  const click = e => {
    const t = e.target, g = s => t.closest && t.closest(s);
    let x;
    if (g('[data-ccback]')) { ccRecClose(); return; }
    if ((x = g('[data-ccnav]'))) { ccRecNav(Number(x.dataset.ccnav)); return; }
    if ((x = g('[data-cctab]'))) { ccTabShow(x.dataset.cctab); return; }
    if ((x = g('[data-ccdo]'))) { ccDecide(x.dataset.ccdo); return; }
    if ((x = g('[data-cclink]'))) { ccDecide('already', Number(x.dataset.cclink)); return; }
    if (g('[data-ccretry]')) { const r = ccRow(CC.open); if (r) { delete (ccCache[r.id] || {}).chat; ccTabShow('chat'); } return; }
    if ((x = g('[data-cqwide]'))) { const c = cqCacheOf(-1); c.wide = !c.wide; const r = ccRow(CC.open), ch = r && ccCache[r.id] && ccCache[r.id].chat; const b = document.getElementById('ccTabBody'); if (b && ch) b.innerHTML = ccChatHtml(r, ch); return; }
    if ((x = g('[data-ccyes]'))) { const r = ccRow(CC.open); if (r) { ccChat(r, Number(x.dataset.ccyes)).then(() => ccTabShow('chat')); } return; }
    if ((x = g('[data-cqgo]'))) { const el = document.getElementById(x.dataset.cqgo); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if ((x = g('[data-ccstat]'))) { CC.status = (CC.status === x.dataset.ccstat) ? 'all' : x.dataset.ccstat; const s = document.getElementById('ccS'); if (s) s.value = CC.status; ccPaint(); const l = document.getElementById('ccList'); if (l && x.closest('.cq-intro')) l.scrollIntoView({ behavior: 'smooth' }); return; }
    if ((x = g('tr.cq-row'))) { ccRecOpen(Number(x.dataset.i)); return; }
  };
  main.addEventListener('click', click);
  if (rec) rec.addEventListener('click', click);
  const q = document.getElementById('ccQ'), c = document.getElementById('ccC'), s = document.getElementById('ccS');
  if (q) q.addEventListener('input', () => { CC.q = q.value; ccPaintList(); });
  if (c) { c.value = CC.chat; c.addEventListener('change', () => { CC.chat = c.value; ccPaintList(); }); }
  if (s) { s.value = CC.status; s.addEventListener('change', () => { CC.status = s.value; ccPaint(); }); }
  main.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('cq-row')) { e.preventDefault(); ccRecOpen(Number(e.target.dataset.i)); } });
  if (!window.ccKeysWired) {
    window.ccKeysWired = true;
    document.addEventListener('keydown', e => {
      const rec2 = document.getElementById('ccRec'); if (!rec2 || rec2.classList.contains('cq-gone') || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '') || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'c') ccDecide('confirmed'); else if (k === 'n') ccDecide('not'); else if (k === 'a') ccDecide('already'); else if (k === 'u') ccDecide('unsure');
      else if (k === 'arrowright' || k === 'j') ccRecNav(1); else if (k === 'arrowleft' || k === 'k') ccRecNav(-1); else if (k === 'escape') ccRecClose();
    });
  }
}

async function renderComplaintChats() {
  const el = document.getElementById('complaintChatsContent'); if (!el) return;
  if (!cqLevelOk('complaintchats')) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Chat complaints review is for Levels 3 and up.</p></div>'; return; }
  el.innerHTML = ccShell();
  ccWire();
  try {
    const { data, error } = await sb.rpc('complaint_candidates_list', { p_status: 'all', p_chat: 'all', p_q: '' });
    if (error) throw error;
    CC.rows = (data && data.rows) || [];
    ccPaint();
  } catch (e) {
    console.error(e);
    const b = document.getElementById('ccBody'); if (b) b.innerHTML = '<p class="cq-meta" style="padding:10px 4px">The chats did not load. Refresh to try again.</p>';
  }
}
