// Log a Complaint (Kate, 22 Oct 2026): "add the client complaints submission under client complaints section", as its own page and not in the
// mini side nav of Client Complaints. The form (client_complaint_submit) and the page that lists the complaints logged from it, to follow up and
// close. It shares state, styles and the list with complaints.js (CQ, cqCss, cqLoadList, cqPaintList, cqUpdate, cqRemove), which loads first in the
// same lazy group (cp); only one of the two pages is drawn at a time, so their ids never meet. Levels 2 and up, enforced in every function.

function cqForm() {
  const picked = cqPicked();
  const brs = [['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['BAH', 'Bahrain']];
  const bopts = ['<option value="">Pick the branch</option>'].concat(brs.map(([k, l]) => `<option value="${k}"${picked.length === 1 && picked[0] === k ? ' selected' : ''}>${l}</option>`)).join('');
  const topts = ['<option value="">Pick one</option>'].concat(Object.keys(CQ_TYPE).filter(k => k !== 'unclear' && k !== 'repeat_complainer').map(k => `<option value="${k}">${cqEsc(CQ_TYPE[k])}</option>`)).join('');
  const ropts = ['<option value="">Not resolved yet (keep it open)</option>'].concat(Object.keys(CQ_RES).filter(k => k !== 'unclear' && k !== 'open').map(k => `<option value="${k}">${cqEsc(CQ_RES[k])}</option>`)).join('');
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Minimisable (Kate, 22 Oct 2026): open the first time, then it stays as it was left in this browser.
  let closed = false; try { closed = localStorage.getItem('trs-cq-form') === 'closed'; } catch (e) {}
  return `<details class="cq-card" id="cq-new"${closed ? '' : ' open'} ontoggle="try{localStorage.setItem('trs-cq-form',this.open?'open':'closed')}catch(e){}"><summary>Log a complaint</summary>
    <p class="cq-note" style="margin-top:6px">For a complaint a client made that is not in the Phorest notes yet. It is counted with the rest and marked as logged by staff, under your name. The client, branch, date, kind, what happened and how it ended are needed; the rest helps.</p>
    <div class="cq-form">
      <label>Client's full name<input id="cqfClient" class="cq-in" maxlength="80" autocomplete="off"></label>
      <label>Branch<select id="cqfBranch" class="cq-sel">${bopts}</select></label>
      <label>Date of the visit<input id="cqfDate" class="cq-in" type="date" max="${today}"></label>
      <label>Stylist (optional)<input id="cqfStylist" class="cq-in" maxlength="80" autocomplete="off"></label>
      <label>Service (optional)<input id="cqfService" class="cq-in" maxlength="120" autocomplete="off"></label>
      <label>What it was about<select id="cqfType" class="cq-sel">${topts}</select></label>
      <label class="wide">What happened<textarea id="cqfDetail" rows="3" maxlength="4000" placeholder="One or two sentences, in your own words"></textarea></label>
      <label>How it was resolved, if it has been<select id="cqfRes" class="cq-sel">${ropts}</select></label>
      <label>How it ended, in a few words (optional)<input id="cqfResD" class="cq-in" maxlength="300" autocomplete="off"></label>
      <label>Handled by (optional)<input id="cqfBy" class="cq-in" maxlength="80" autocomplete="off"></label>
      <label>Google review link, if they posted one (optional)<input id="cqfG" class="cq-in" type="url" placeholder="https://" autocomplete="off"></label>
    </div>
    <div class="cq-bar"><button type="button" id="cqfGo" class="cq-btn pri">Log this complaint</button><span id="cqfMsg" class="cq-msg" aria-live="polite"></span></div>
  </details>`;
}

async function cqSubmit() {
  const v = id => (document.getElementById(id) || {}).value || '';
  const msg = document.getElementById('cqfMsg'), btn = document.getElementById('cqfGo');
  const say = (t, err) => { if (msg) { msg.textContent = t; msg.className = 'cq-msg' + (err ? ' err' : ''); } };
  const p = {
    p_client: v('cqfClient').trim(), p_branch: v('cqfBranch'), p_date: v('cqfDate') || null, p_stylist: v('cqfStylist').trim(), p_service: v('cqfService').trim(),
    p_type: v('cqfType'), p_detail: v('cqfDetail').trim(), p_resolution: v('cqfRes'), p_resolution_detail: v('cqfResD').trim(), p_handled_by: v('cqfBy').trim(),
    p_google_url: v('cqfG').trim()
  };
  if (p.p_client.length < 3) return say('Write the client\'s full name.', true);
  if (!p.p_branch) return say('Pick the branch.', true);
  if (!p.p_date) return say('Pick the date of the visit.', true);
  if (!p.p_type) return say('Pick what the complaint was about.', true);
  if (p.p_detail.length < 10) return say('Write what happened, a sentence will do.', true);
  if (p.p_google_url && !/^https?:\/\//i.test(p.p_google_url)) return say('The Google link must start with http.', true);
  if (btn) btn.disabled = true;
  say('Saving…');
  try {
    const { error } = await sb.rpc('client_complaint_submit', p);
    if (error) throw error;
    ['cqfClient', 'cqfStylist', 'cqfService', 'cqfDetail', 'cqfResD', 'cqfBy', 'cqfG', 'cqfDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['cqfType', 'cqfRes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    say((p.p_resolution ? 'Logged as resolved.' : 'Logged as open. Open it in the list below to add follow-ups and mark it resolved.') + ' It shows under the date you gave, as long as that date is inside the Period and Branch picked above.');
    CQ.page = 0; CQ.sort = 'date'; CQ.dir = 'desc'; cqOpen = 0;
    cqLoadSummary(); cqLoadList();
  } catch (e) {
    console.error(e);
    say((e && e.message) ? e.message : 'It did not save. Try again.', true);
  } finally { if (btn) btn.disabled = false; }
}


// ── LOG A COMPLAINT (Kate, 22 Oct 2026: "add the client complaints submission under client complaints section", not in the same mini side nav) ──
// Its own page in the Clients group: the form, and the complaints logged from it, to follow up and close. Same list, filters, follow-up and
// Remove as Client Complaints (list source 'logged' = only the ones logged from the form), so the ids are shared and only one page is drawn at a time.
function cqLogShell() {
  return cqCss() + `<div class="cq">
    <h1>Log a Complaint</h1>
    <p class="cq-sub">When a client complains, log it here so it is written down once, followed up and closed, and not left in WhatsApp. Leave How it was resolved empty and it stays open until you mark it resolved. Levels 2 and up. Everything logged here also counts in Client Complaints.</p>
    ${cqRailShell(`${cqForm()}
    <div class="cq-card cq-wait" id="cq-list">
      <h2>Logged complaints</h2>
      <p class="cq-note">Tap one to add a follow-up, mark it resolved with how it ended, or reopen it. Branch and Period follow the filters at the top.</p>
      <div class="cq-bar cq-filt">
        <input id="cqQ" class="cq-in" type="search" inputmode="search" autocomplete="off" placeholder="Name, stylist or words in the note" aria-label="Search complaints" value="${cqEsc(CQ.q)}">
        <button type="button" id="cqFtog" class="cq-btn cq-ftog" aria-expanded="false">Filters</button>
        <div class="cq-fsel">
        <select id="cqSt" class="cq-sel" aria-label="Status"><option value="all">Status: any</option><option value="open">Still open</option><option value="resolved">Resolved</option></select>
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
  if (!cqLevelOk('complaintlog')) { el.innerHTML = '<div class="cq"><p class="cq-meta" style="padding:20px 0">Log a Complaint is for Levels 2 and up.</p></div>'; return; }
  const other = document.getElementById('complaintsContent'); if (other) other.innerHTML = '';
  cqMode = 'log';
  CQ.page = 0; cqOpen = 0;
  el.innerHTML = cqLogShell();
  cqWire();
  cqLoadList();
  cqAllTime();
}

// The masthead's Branch or Period changed while this page is open (dashboard.js NOPULSE_REDRAW).
function cqRefreshLog() {
  if (!document.getElementById('cqBody') || cqMode !== 'log') return renderComplaintLog();
  CQ.page = 0; cqOpen = 0;
  return cqLoadList();
}
