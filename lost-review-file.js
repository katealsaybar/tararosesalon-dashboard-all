// Lost Clients review in Google Sheets (Kate, 12 Oct 2026). The coordinators and reception take clients out of the blast on one
// Google Sheet per branch (phorest data export/lost review sheets in the cowork repo: a Take out? dropdown and a Note column, read back
// into lost_excluded every 15 minutes), so there is one live copy and nothing to download and upload. This is the button that opens
// a branch's sheet; the links are kept in lost_sheet_links (migrations/lost_sheet_links.sql) and read with lost_sheet_links()
// (Level 2 and above). An earlier version of this file built a review Excel file and read it back; that went on 12 Oct 2026, because
// two copies of the truth (a file in a Downloads folder and the sheet) was the problem the Sheets solve.
// Uses lost-lists.js (llPopFor, llClosePop) and LC_BRANCH.

let lrfLinks = null;
async function lrfLoadLinks() {
  if (lrfLinks) return lrfLinks;
  const { data, error } = await sb.rpc('lost_sheet_links');
  lrfLinks = !error && data ? data : {};
  return lrfLinks;
}
function lrfOpen(branch) {
  llClosePop();
  const url = (lrfLinks || {})[branch];
  if (url) window.open(url, '_blank', 'noopener');
}
async function lrfMenu(ev) {
  ev.stopPropagation();
  if (llPopFor === 'lrf') { llClosePop(); return; }
  llClosePop();
  const r = ev.currentTarget.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.id = 'llPop'; pop.className = 'll-pop'; pop.setAttribute('role', 'dialog');
  pop.style.top = (r.bottom + 4) + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 270)) + 'px';
  pop.innerHTML = '<div class="ll-pt">Open the review sheet for</div><p class="slv-note" style="padding:4px 10px">Loading…</p>';
  document.body.appendChild(pop);
  llPopFor = 'lrf';
  const links = await lrfLoadLinks();
  if (document.getElementById('llPop') !== pop) return;
  pop.innerHTML = '<div class="ll-pt">Open the review sheet for</div>'
    + Object.keys(LC_BRANCH).map(b => links[b]
      ? `<button type="button" class="ll-opt" onclick="lrfOpen('${b}')">${lcEsc(LC_BRANCH[b])}</button>`
      : `<button type="button" class="ll-opt" disabled>${lcEsc(LC_BRANCH[b])} <em>not set up</em></button>`).join('')
    + '<div class="ll-pt ll-pn">Pick Take out? and a Note for the clients who should not get the message. Changes reach the dashboard within about 15 minutes. You need to be shared on the sheet.</div>'
    + '<div class="lrf-add" id="lrfAdd"></div>';
  lrfPaintAdd();
}

// Stop adding new clients to the sheets (Kate, 18 Oct 2026). Each refresh adds clients who have joined the lists since to the bottom of the
// four sheets, in green. Once every message of the October 2026 blast has gone out, Level 3 and above can stop that; rows already on the
// sheets keep their Next appointment, Status and After our message. State is in lost_sheet_config (migrations/lost_sheet_adding.sql).
async function lrfPaintAdd(msg) {
  const el = document.getElementById('lrfAdd');
  if (!el) return;
  if (!el.innerHTML) el.innerHTML = '<div class="ll-pt ll-pn">Checking…</div>';
  const { data, error } = await sb.rpc('lost_sheet_adding_get');
  if (document.getElementById('lrfAdd') !== el) return;
  if (error || !data) { el.innerHTML = ''; return; }          // the switch is not there yet: say nothing
  const can = typeof llPhones === 'function' && llPhones();   // Level 3 and above
  const day = data.at ? new Date(data.at).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }) : '';
  el.innerHTML = (data.add_new
    ? `<div class="ll-pt ll-pn">New clients are added to the bottom of each sheet every day, in green.</div>`
      + (can ? `<button type="button" class="ll-opt lrf-stop" onclick="lrfAddSet(false)">Stop adding new clients</button>` : '')
    : `<div class="ll-pt ll-pn"><b>Adding new clients is stopped</b>${data.by ? ' by ' + lcEsc(data.by) : ''}${day ? ' on ' + lcEsc(day) : ''}. The rows already on the sheets keep updating.</div>`
      + (can ? `<button type="button" class="ll-opt lrf-stop" onclick="lrfAddSet(true)">Start adding new clients again</button>` : ''))
    + (msg ? `<div class="ll-pt ll-pn">${lcEsc(msg)}</div>` : '');
}
async function lrfAddSet(on) {
  if (!on && !confirm('Stop adding new clients to the four sheets?\n\nRows already on the sheets keep updating. You can start it again here.')) return;
  const { error } = await sb.rpc('lost_sheet_adding_set', { p_on: !!on });
  lrfPaintAdd(error ? 'That did not save. You need Level 4 or above.' : '');
}
