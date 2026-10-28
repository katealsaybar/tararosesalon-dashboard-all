// Log a Complaint (Kate, 22 Oct 2026): "add the client complaints submission under client complaints section", as its own page and not in the
// mini side nav of Client Complaints. The form (client_complaint_submit) and the page that lists the complaints logged from it, to follow up and
// close. It shares state, styles and the list with complaints.js (CQ, cqCss, cqLoadList, cqPaintList, cqUpdate, cqRemove), which loads first in the
// same lazy group (cp); only one of the two pages is drawn at a time, so their ids never meet. Levels 2 and up, enforced in every function.

// Kate, 22 Oct 2026: "make sure na ma-flag or di mag-go through if duplicate filing", and an i button that reminds to check first.
// client_complaint_dupes looks for the same client (full name, or first and last name) near that date; the same client, branch and date is
// refused by client_complaint_submit itself (DUPLICATE), a similar one asks for a confirmation (SIMILAR, then p_force).
const CQ_DUP_TIP = 'Check first: search Logged complaints below, and Client Complaints, for this client. If it is already there, open it and add a follow-up instead of logging it again. The same client, branch and date cannot be logged twice.';
const cqInfo = () => `<button type="button" class="cq-i" aria-label="Check that it was not already submitted" data-tip="${cqEsc(CQ_DUP_TIP)}" onclick="event.preventDefault();event.stopPropagation()">i</button>`;
let cqDupSeq = 0, cqDupTimer = 0;

function cqSyncDates() {
  const a = document.getElementById('cqfDate'), c = document.getElementById('cqfCDate');
  if (a && c) { c.min = a.value || ''; if (a.value && c.value && c.value < a.value) c.value = a.value; }
}
function cqWireDup() {
  [['cqfClient', 'input'], ['cqfBranch', 'change'], ['cqfDate', 'change']].forEach(([id, ev]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.dw) { el.dataset.dw = '1'; el.addEventListener(ev, cqDupSoon); }
  });
  const a = document.getElementById('cqfDate');
  if (a && !a.dataset.ds) { a.dataset.ds = '1'; a.addEventListener('change', cqSyncDates); }
}
function cqDupSoon() { clearTimeout(cqDupTimer); cqDupTimer = setTimeout(cqCheckDup, 450); }
async function cqCheckDup() {
  const box = document.getElementById('cqfDup');
  if (!box) return;
  const val = id => ((document.getElementById(id) || {}).value || '').trim();
  const name = val('cqfClient');
  if (name.length < 3) { box.hidden = true; return; }
  const seq = ++cqDupSeq;
  try {
    const { data, error } = await sb.rpc('client_complaint_dupes', { p_name: name, p_branch: val('cqfBranch'), p_date: val('cqfDate') || null });
    if (error || seq !== cqDupSeq) return;
    const rows = data || [], exact = rows.some(r => r.exact);
    if (!rows.length) { box.hidden = true; return; }
    box.className = 'cq-dup' + (exact ? ' hard' : '');
    box.innerHTML = `<b>${exact ? 'This one is already on file, so it cannot be logged again.' : 'Check before you log: this client already has a complaint on file.'}</b>`
      + `<ul>${rows.map(r => `<li>${cqEsc(r.text)}</li>`).join('')}</ul>`
      + `<div class="cq-note" style="margin:4px 0 0">${exact ? 'Find it in Logged complaints below and add a follow-up there.' : 'If it is the same complaint, add a follow-up to it. If it is a new one, go ahead and log it.'}</div>`;
    box.hidden = false;
  } catch (e) { /* the server checks again on submit */ }
}

function cqForm() {
  const picked = cqPicked();
  const brs = [['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['BAH', 'Bahrain']];
  const bopts = ['<option value="">Pick the branch</option>'].concat(brs.map(([k, l]) => `<option value="${k}"${picked.length === 1 && picked[0] === k ? ' selected' : ''}>${l}</option>`)).join('');
  const topts = ['<option value="">Pick one</option>'].concat(Object.keys(CQ_TYPE).filter(k => k !== 'unclear' && k !== 'repeat_complainer').map(k => `<option value="${k}">${cqEsc(CQ_TYPE[k])}</option>`)).join('');
  const ropts = ['<option value="">Not resolved yet (keep it open)</option>'].concat(Object.keys(CQ_RES).filter(k => k !== 'unclear' && k !== 'open').map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Minimisable (Kate, 22 Oct 2026): open the first time, then it stays as it was left in this browser.
  let closed = false; try { closed = localStorage.getItem('trs-cq-form') === 'closed'; } catch (e) {}
  return `<details class="cq-card" id="cq-new"${closed ? '' : ' open'} ontoggle="try{localStorage.setItem('trs-cq-form',this.open?'open':'closed')}catch(e){}"><summary>Log a complaint ${cqInfo()}</summary>
    <p class="cq-note" style="margin-top:6px">For a complaint a client made that is not in the Phorest notes yet. It is counted with the rest and marked as logged by staff, under your name. The client, her mobile number, branch, the date of the appointment, the date she complained (as reception wrote it in Phorest), the kind and what happened are needed; the rest helps. The mobile number finds her again fast. Reply to her within 2 days of the complaint and close it within 7: the list shows what is overdue. A colour complaint stays open until she has come back.</p>
    <div class="cq-form">
      <label>Client's full name<input id="cqfClient" class="cq-in" maxlength="80" autocomplete="off"></label>
      <label>Mobile number<input id="cqfPhone" class="cq-in" type="tel" inputmode="tel" maxlength="24" autocomplete="off" placeholder="05x xxx xxxx or +971 …"></label>
      <label>Branch<select id="cqfBranch" class="cq-sel">${bopts}</select></label>
      <label>Date of the appointment<input id="cqfDate" class="cq-in" type="date" max="${today}"></label>
      <label>Date she complained<input id="cqfCDate" class="cq-in" type="date" max="${today}" value="${today}"></label>
      <label>Stylist (optional)<input id="cqfStylist" class="cq-in" maxlength="80" autocomplete="off"></label>
      <label>Service (optional)<input id="cqfService" class="cq-in" maxlength="120" autocomplete="off"></label>
      <label>What it was about<select id="cqfType" class="cq-sel">${topts}</select></label>
      <label class="wide">What happened<textarea id="cqfDetail" rows="3" maxlength="4000" placeholder="One or two sentences, in your own words"></textarea></label>
      <label>Responsible for closing it (optional)<input id="cqfResp" class="cq-in" maxlength="80" list="cqRespList" autocomplete="off"></label>
      <label>How it was resolved, if it has been<select id="cqfRes" class="cq-sel">${ropts}</select></label>
      <label>How it ended, in a few words (optional)<input id="cqfResD" class="cq-in" maxlength="300" autocomplete="off"></label>
      <label>Handled by (optional)<input id="cqfBy" class="cq-in" maxlength="80" autocomplete="off"></label>
      <label>Google review link, if they posted one (optional)<input id="cqfG" class="cq-in" type="url" placeholder="https://" autocomplete="off"></label>
      <label class="wide">Screenshots of the conversation or photos (optional, up to 10 files of 10 MB)<input id="cqfFiles" type="file" multiple accept="image/*,application/pdf,.txt"></label>
    </div>
    <div id="cqfDup" class="cq-dup" hidden></div>
    <div class="cq-bar"><button type="button" id="cqfGo" class="cq-btn pri">Log this complaint</button>${cqInfo()}<span id="cqfMsg" class="cq-msg" aria-live="polite"></span></div>
  </details>`;
}

async function cqSubmit() {
  const v = id => (document.getElementById(id) || {}).value || '';
  const msg = document.getElementById('cqfMsg'), btn = document.getElementById('cqfGo');
  const say = (t, err) => { if (msg) { msg.textContent = t; msg.className = 'cq-msg' + (err ? ' err' : ''); } };
  const p = {
    p_client: v('cqfClient').trim(), p_branch: v('cqfBranch'), p_date: v('cqfDate') || null, p_stylist: v('cqfStylist').trim(), p_service: v('cqfService').trim(),
    p_type: v('cqfType'), p_detail: v('cqfDetail').trim(), p_resolution: v('cqfRes'), p_resolution_detail: v('cqfResD').trim(), p_handled_by: v('cqfBy').trim(),
    p_google_url: v('cqfG').trim(), p_phone: v('cqfPhone').trim(), p_complaint_date: v('cqfCDate') || null, p_responsible: v('cqfResp').trim()
  };
  const files = Array.from((document.getElementById('cqfFiles') || {}).files || []);
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  if (p.p_client.length < 3) return say('Write the client\'s full name.', true);
  if (!(p.p_phone.replace(/\D/g, '').length >= 7 && p.p_phone.replace(/\D/g, '').length <= 15)) return say('Write the client\'s mobile number (7 to 15 digits).', true);
  if (!p.p_branch) return say('Pick the branch.', true);
  if (!p.p_date) return say('Pick the date of the appointment.', true);
  if (!p.p_complaint_date) return say('Pick the date she complained.', true);
  if (p.p_complaint_date < p.p_date || p.p_complaint_date > today) return say('The date she complained cannot be before the appointment or in the future.', true);
  if (!p.p_type) return say('Pick what the complaint was about.', true);
  if (p.p_detail.length < 10) return say('Write what happened, a sentence will do.', true);
  if (p.p_google_url && !/^https?:\/\//i.test(p.p_google_url)) return say('The Google link must start with http.', true);
  if (p.p_type === 'colour_result' && CQ_NEEDS_REVISIT.includes(p.p_resolution)) return say('A colour complaint is closed once she has come back and agreed. Leave How it was resolved empty, then add the revisit when she returns.', true);
  if (files.length > 10) return say('Add up to 10 files.', true);
  if (btn) btn.disabled = true;
  say('Saving…');
  try {
    let force = false, newId = null;
    for (;;) {
      const { data, error } = await sb.rpc('client_complaint_submit', { ...p, p_force: force });
      if (!error) { newId = data; break; }
      const m = String(error.message || '');
      if (!force && m.startsWith('SIMILAR:')) {
        const ok = window.confirm('This client already has a complaint on file:\n\n' + m.replace(/^SIMILAR:\s*/, '').split('; ').join('\n')
          + '\n\nIf it is the same complaint, cancel and add a follow-up to it instead.\nLog this as a new complaint?');
        if (!ok) { say('Not logged. Check the one on file first.'); return; }
        force = true;
        continue;
      }
      throw error;
    }
    let upMsg = '';
    if (files.length && newId) {
      say('Logged. Uploading the files…');
      const r = await cqUpload(Number(newId), files);
      upMsg = r.fails.length ? ` ${r.ok} file${r.ok === 1 ? '' : 's'} added. Not added: ${r.fails.join('; ')}. Open the complaint to add them again.` : ` ${r.ok} file${r.ok === 1 ? '' : 's'} added.`;
    }
    const dupBox = document.getElementById('cqfDup'); if (dupBox) dupBox.hidden = true;
    ['cqfClient', 'cqfPhone', 'cqfStylist', 'cqfService', 'cqfDetail', 'cqfResp', 'cqfResD', 'cqfBy', 'cqfG', 'cqfDate', 'cqfFiles'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const cd = document.getElementById('cqfCDate'); if (cd) { cd.value = today; cd.min = ''; }
    ['cqfType', 'cqfRes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    say((p.p_resolution ? 'Logged as resolved.' : 'Logged as open. Open it in the list below to add follow-ups and mark it resolved.') + upMsg + ' It shows under the date she complained, as long as that date is inside the Period and Branch picked above.', !!(upMsg && /Not added/.test(upMsg)));
    CQ.page = 0; CQ.sort = 'priority'; CQ.dir = 'asc'; cqOpen = 0;
    cqLoadSummary(); cqLoadList(); cqLoadFlags();
  } catch (e) {
    console.error(e);
    const m = (e && e.message) ? String(e.message).replace(/^DUPLICATE:\s*/, 'Already logged: ') : 'It did not save. Try again.';
    say(m, true);
  } finally { if (btn) btn.disabled = false; }
}


// ── LOG A COMPLAINT (Kate, 22 Oct 2026: "add the client complaints submission under client complaints section", not in the same mini side nav) ──
// Its own page in the Clients group: the form, and the complaints logged from it, to follow up and close. Same list, filters, follow-up and
// Remove as Client Complaints (list source 'logged' = only the ones logged from the form), so the ids are shared and only one page is drawn at a time.
function cqLogShell() {
  return cqCss() + `<div class="cq">
    <h1>Log a Client Complaint</h1>
    <p class="cq-sub">When a client complains, log it here so it is written down once, followed up and closed, and not left in WhatsApp. Leave How it was resolved empty and it stays open until you mark it resolved. Reply to the client within 2 days of the complaint and close it within 7; what is overdue shows first. Levels 3 and up. Everything logged here also counts in Client Complaints.</p>
    ${cqRailShell(`<div class="cq-tiles" id="cqFlags" aria-live="polite"></div>
    <datalist id="cqRespList"><option value="Emma W"><option value="Ashleigh"><option value="Mette"><option value="Coach Emma"><option value="Mona"><option value="Kate"></datalist>
    ${cqForm()}
    <div class="cq-card cq-wait" id="cq-list">
      <h2>Logged complaints</h2>
      <p class="cq-note">Tap one to add a follow-up, mark it resolved with how it ended, or reopen it. Branch and Period follow the filters at the top.</p>
      <div class="cq-bar cq-filt">
        <input id="cqQ" class="cq-in" type="search" inputmode="search" autocomplete="off" placeholder="Name, mobile number, stylist or words in the note" aria-label="Search complaints" value="${cqEsc(CQ.q)}">
        <button type="button" id="cqFtog" class="cq-btn cq-ftog" aria-expanded="false">Filters</button>
        <div class="cq-fsel">
        <select id="cqSt" class="cq-sel" aria-label="Status"><option value="all">Status: any</option><option value="open">Still open</option><option value="overdue">Overdue</option><option value="pending">Pending action</option><option value="resolved">Resolved</option></select>
        </div>
      </div>
      <div class="cq-metarow"><p class="cq-meta" id="cqMeta" aria-live="polite"></p><span class="cq-sheetwrap"><span id="cqSheetMsg" class="cq-meta" aria-live="polite"></span><button type="button" id="cqSheet" class="cq-btn">Open in Google Sheets</button></span></div>
      <div id="cqBody" style="overflow-x:auto"><p class="cq-meta">Loading…</p></div>
    </div>`, [['cq-new', 'Log a complaint'], ['cq-list', 'Logged complaints']])}
  </div>`;
}

function renderComplaintLog() {
  const el = document.getElementById('complaintlogContent');
  if (!el) return;
  if (!cqLevelOk('complaintlog')) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Log a Client Complaint is for Levels 3 and up.</p></div>'; return; }
  const other = document.getElementById('complaintsContent'); if (other) other.innerHTML = '';
  cqMode = 'log';
  CQ.page = 0; cqOpen = 0; CQ.sort = 'priority'; CQ.dir = 'asc';
  el.innerHTML = cqLogShell();
  cqWire();
  const fl = document.getElementById('cqFlags');
  if (fl) fl.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-flt]');
    if (!b) return;
    CQ.status = CQ.status === b.dataset.flt ? 'all' : b.dataset.flt;
    const sel = document.getElementById('cqSt'); if (sel) sel.value = CQ.status;
    CQ.page = 0; cqOpen = 0; cqLoadList(); cqLoadFlags();
  });
  cqLoadList();
  cqLoadFlags();
  cqAllTime();
}

// The strip at the top (Belle, 26 Oct 2026): what is overdue, what is pending, what is still waiting for a first reply. Tap Overdue, Pending or Resolved to
// show only those. Counts every logged complaint in the Branch picked above, whatever the Period.
async function cqLoadFlags() {
  const box = document.getElementById('cqFlags');
  if (!box) return;
  try {
    const { data, error } = await sb.rpc('client_complaint_flags', { p_branch: cqBranch() });
    if (error) throw error;
    const t = (k, label, n, cls) => `<button type="button" class="cq-tile btn ${cls}" data-flt="${k}" aria-pressed="${CQ.status === k}"><b>${cqNum(n)}</b><span>${label}</span></button>`;
    box.innerHTML = t('overdue', 'Overdue: no reply in 2 days, or not closed in 7', data.overdue, 'over')
      + t('pending', 'Pending action: open, inside both limits', data.pending, 'pend')
      + `<div class="cq-tile"><b>${cqNum(data.unreplied)}</b><span>Still waiting for a first reply</span></div>`
      + t('resolved', 'Resolved', data.resolved, '');
  } catch (e) { console.error(e); box.innerHTML = ''; }
}

// The masthead's Branch or Period changed while this page is open (dashboard.js NOPULSE_REDRAW).
function cqRefreshLog() {
  if (!document.getElementById('cqBody') || cqMode !== 'log') return renderComplaintLog();
  CQ.page = 0; cqOpen = 0;
  cqLoadFlags();
  return cqLoadList();
}
