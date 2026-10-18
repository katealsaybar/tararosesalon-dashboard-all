// Lost Clients, Group 6: Consultation follow-up (Kate, 12 Oct 2026, after Cristine Bracamonte asked: "nafilter din po ba ung mga clients who just came in
// for consultation? Tas di na nagpabook?"). A consultation is a zero-value service line, so it counts as a visit: the client is never "lost" and never in
// the blast. She still needs a call or a message, so she gets a group of her own, outside the blast. lost_consults() / lost_consult_mark() in
// migrations/lost_consults.sql: a consultation in the last 30 days (lost_lists_config.consult_days), nothing bought that day, no visit since, no booking.
// Reception marks "Contacted" so nobody is chased twice. Level 2 and above; the phone number is Level 3 and above (the server leaves it out).
// Drawn by lost-lists.js into the same card row and panel (its list id is 'c'); loaded after lost-lists.js and lost-clients.js.

let lcnQuery = '', lcnPage = 1;
const LCN_PER = 25;
const lcnSel = { br: 'all', hide: true };
try { Object.assign(lcnSel, JSON.parse(localStorage.getItem('trs-lost-consults') || '{}')); } catch (e) {}
const lcnSave = () => { try { localStorage.setItem('trs-lost-consults', JSON.stringify(lcnSel)); } catch (e) {} };

async function lcnFetch(force) {
  if (llRows.c && !force) return llRows.c;
  const { data, error } = await sb.rpc('lost_consults');
  if (error || !Array.isArray(data)) throw error || new Error('no consultations');
  llRows.c = data;
  lcnCount();
  return data;
}
// The card's number sits in the summary object the other cards read, so the Show group menu and the card agree.
function lcnCount() {
  const rows = llRows.c || [];
  llSum = llSum || {}; llSum.lists = llSum.lists || {};
  llSum.lists.c = { n: rows.filter(r => !r.contacted_on).length, contacted: rows.filter(r => r.contacted_on).length, wa: {} };
}
function lcnCardHtml(l) {
  const S = (llSum && llSum.lists && llSum.lists.c) || null;
  const pending = S ? lcNum(S.n) : '…';
  return `<div class="ll-card${l.id === llSel.list ? ' on' : ''}" data-id="c" role="button" tabindex="0" aria-pressed="${l.id === llSel.list}"
      title="Show ${llLabel(l)}" onclick="llPick('c')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();llPick('c')}">
      <div class="ll-g">${llLabel(l)}</div><div class="ll-t">${lcEsc(l.t)}</div><div class="ll-n">${pending}</div>
      <div class="ll-d">${lcEsc(l.d)}</div>
      <div class="ll-ch">${lcEsc(l.ch)}</div>
      <div class="ll-bot"><dl class="ll-mix">
        <div><dt>Still to contact</dt><dd>${S ? lcNum(S.n) : '…'}</dd></div>
        <div><dt>Contacted</dt><dd>${S ? lcNum(S.contacted) : '…'}</dd></div>
        <div><dt>Not part of the blast</dt><dd>·</dd></div></dl></div>
    </div>`;
}

function lcnFiltered() {
  const q = lcnQuery.trim().toLowerCase();
  return (llRows.c || []).filter(r => (lcnSel.br === 'all' || r.branch === lcnSel.br) && !(lcnSel.hide && r.contacted_on)
    && (!q || (r.client_name + ' ' + (r.by || '')).toLowerCase().includes(q)));
}
function lcnPaintPanel() {
  const box = document.getElementById('llPanel');
  if (!box) return;
  const L = llList();
  const ph = llPhones();
  const all = llRows.c || [];
  const brs = Object.keys(LC_BRANCH);
  box.innerHTML = `
    <div class="slv-head"><div><div class="slv-eyebrow">${lcEsc(L.ch)}</div><h3>${lcEsc(llName(L))}</h3><p id="lcnCount"></p></div></div>
    <div class="ll-def">${L.def}</div>
    <div class="lc-tools ll-tools">
      <select class="ll-sel" aria-label="Branch" onchange="lcnSel.br=this.value;lcnPage=1;lcnSave();lcnPaintTable()"><option value="all">All branches</option>${brs.map(b => `<option value="${b}"${lcnSel.br === b ? ' selected' : ''}>${lcEsc(LC_BRANCH[b])} (${lcNum(all.filter(r => r.branch === b && !r.contacted_on).length)})</option>`).join('')}</select>
      <input type="search" class="ll-search" id="lcnSearch" placeholder="Search name or stylist" value="${lcEsc(lcnQuery)}" oninput="lcnQuery=this.value;lcnPage=1;lcnPaintTable()">
      <label class="ll-hide"><input type="checkbox" ${lcnSel.hide ? 'checked' : ''} onchange="lcnSel.hide=this.checked;lcnPage=1;lcnSave();lcnPaintTable()"> Hide the ones already contacted</label>
      <span id="llNote" class="slv-note" style="display:inline"></span>
    </div>
    <div id="llTable"></div>
    <p class="slv-muted ll-foot">A consultation counts as a visit, so these clients are never in the five groups or the blast. Here: came in for a consultation in the last 30 days, nothing bought that day, no visit since and no booking. ${ph ? 'Phone numbers are shown to Level 3 and above. ' : 'Phone numbers are for Level 3 and above. '}Mark Contacted once you have called or messaged her, so nobody is chased twice. The list refreshes with the latest sales and bookings each time the page opens.</p>`;
  lcnPaintTable();
}
function lcnPaintTable() {
  const box = document.getElementById('llTable');
  if (!box) return;
  const rows = lcnFiltered(), pages = Math.max(1, Math.ceil(rows.length / LCN_PER));
  lcnPage = Math.min(Math.max(1, lcnPage), pages);
  const shown = rows.slice((lcnPage - 1) * LCN_PER, lcnPage * LCN_PER);
  llShown = shown;
  const cnt = document.getElementById('lcnCount');
  const all = llRows.c || [];
  if (cnt) cnt.textContent = `${lcNum(rows.length)} shown of ${lcNum(all.length)} · ${lcNum(all.filter(r => !r.contacted_on).length)} still to contact`;
  const ph = llPhones();
  const when = r => `${lcEsc(llDayS(r.consult_on))}<div class="slv-note">${lcNum(r.days_since)} day${r.days_since === 1 ? '' : 's'} ago</div>`;
  const who = r => r.by ? lcStylist(r.by) : '<span class="slv-muted">–</span>';
  const act = (r, i) => r.contacted_on
    ? `<span class="ll-tag sent" title="Marked contacted">Contacted ${lcEsc(llDayS(r.contacted_on))}</span><div class="slv-note">${lcEsc(r.contacted_by || '')}</div><button type="button" class="tglr lc-btn" onclick="lcnMark(${i},false)">Undo</button>`
    : `<button type="button" class="tglr lc-btn lq-pri" onclick="lcnMark(${i},true)">Mark contacted</button>`;
  const heads = ['Client', 'Consultation', 'With'].concat(ph ? ['Phone'] : [], ['Follow-up']);
  const tr = shown.map((r, i) => `<tr><td>${lcEsc(r.client_name)}<div class="slv-note">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(r.area)}</div></td>
      <td class="ll-nw">${when(r)}<div class="slv-note">${lcEsc(r.item || '')}</div></td><td class="ll-team">${who(r)}</td>${ph ? `<td class="ll-ph">${r.mobile ? lcPhone(r) : '<span class="slv-muted">no number</span>'}</td>` : ''}<td class="ll-nw">${act(r, i)}</td></tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}</span></div>
      <div class="prd-meta">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(llDayS(r.consult_on))} (${lcNum(r.days_since)} days ago) · ${lcEsc(r.item || '')}</div>
      ${r.by ? `<div class="prd-meta">With ${lcEsc(r.by)}</div>` : ''}${ph && r.mobile ? `<div class="prd-meta" style="margin-top:4px">${lcPhone(r)}</div>` : ''}
      <div style="margin-top:8px">${act(r, i)}</div></div></li>`).join('');
  box.innerHTML = `<div class="slv-wrap prd-desk lc-wrap ll-wrap"><table class="slv-table"><thead><tr>${heads.map(h => `<th>${lcEsc(h)}</th>`).join('')}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${heads.length}" class="slv-muted">Nobody to follow up with these filters.</td></tr>`}</tbody></table></div>
      <ol class="prd-cards">${cards || '<li class="slv-muted">Nobody to follow up with these filters.</li>'}</ol>
      ${rows.length > LCN_PER ? `<div class="lc-pager"><div class="lc-pg-nav"><span class="lc-pg-txt">Page <b>${lcnPage}</b> of <b>${lcNum(pages)}</b></span>
        <button type="button" class="tglr" onclick="lcnPage--;lcnPaintTable()"${lcnPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
        <button type="button" class="tglr" onclick="lcnPage++;lcnPaintTable()"${lcnPage >= pages ? ' disabled' : ''}>Next ›</button></div></div>` : ''}`;
}
async function lcnMark(i, on) {
  const r = llShown[i];
  if (!r) return;
  const { error } = await sb.rpc('lost_consult_mark', { p_keys: [r.client_key], p_on: on });
  if (error) { console.error(error); llNote('That did not save. Try again.'); return; }
  r.contacted_on = on ? new Date().toISOString().slice(0, 10) : null; r.contacted_by = on ? 'you' : null;
  lcnCount();
  lcnPaintTable();
  const c = document.querySelector('#llHost .ll-cards'); if (c) c.innerHTML = LL_LISTS.map(l => llCard(l)).join('');
}
