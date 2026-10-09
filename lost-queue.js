// Lost Clients, To message and Templates tabs (Kate, 9 Oct 2026). The five groups overlap (group 4 is everyone), so this is the
// one running list built from them: every client who can be messaged, ONE message each, first match wins:
// groups 1 or 2 -> smoothing, group 3 -> colour, group 5 -> other services, group 4 only -> everyone else.
// The list and its message types come from lost_queue() (migrations/lost_queue.sql); the wording of the eight messages is in
// lost_templates, edited from the Templates tab. Level 3 and above (it shows phone numbers).
//
// Sent is read from respond.io (the last message we sent that number, on or after lost_lists_config.campaign_from) and, for a
// message sent outside it (a text, or WhatsApp opened from a link here), from a "Sent" mark kept in lost_messaged with list_id 'q'.
// Replied = she wrote to us on or after the day we messaged her.
//
// Borrows lost-lists.js (llStatus pills, LL_ST, LL_PER) and lost-clients.js (lcEsc, lcNum, lcPhone, lcTeam, lcProfileKey,
// LC_BRANCH) and the XLSX writer (lgx*), so it needs to be loaded after both.
const LQ_TYPES = {
  smoothing_lost:  ['Smoothing, lost', 'Groups 1 and 2'],
  smoothing_still: ['Smoothing, still visiting', 'Group 2'],
  colour:          ['Colour', 'Group 3'],
  other:           ['Other services', 'Group 5'],
  catchall:        ['Everyone else', 'Group 4 only'],
};
const LQ_TYPE_ORDER = ['smoothing_lost', 'smoothing_still', 'colour', 'other', 'catchall'];
const LQ_WA_ORDER = { act: 0, r18: 1, noreply: 2, text: 3 };
const LQ_SHORT = { SAA: 'Saadiyat', KCA: 'Khalifa City', MC: 'Motor City', AQ: 'Al Quoz' };   // how a client is told the branch (not "Khalifa City A")
const LQ_STOP = " If you'd rather not hear from us, just reply STOP.";
// The wording the Templates tab resets to (the same as the rows seeded in migrations/lost_queue.sql).
const LQ_DEFAULTS = {
  wa_smoothing_lost: "Hi {first_name}, this is Tara Rose Salons {branch}. Your last smoothing[ with {stylist}] was back in {month}, and smoothing works best when it's kept on rhythm. If you'd like, we'll start with a proper look at your hair and tell you honestly what it needs. No pressure to book anything. Shall we find you a time that suits?",
  wa_smoothing_still: "Hi {first_name}, this is Tara Rose Salons {branch}. Lovely to have you in with us recently. We noticed your last smoothing was back in {month}. If it's on your mind, {stylist|our team} can look at your hair at your next visit and tell you honestly where it's at. Shall we plan a little time for it at your next visit?",
  wa_colour: "Hi {first_name}, this is Tara Rose Salons {branch}. We were thinking of you. Your last colour[ with {stylist}] was in {month}, and colour looks its best when it's kept on rhythm between visits. Whenever you're ready, we'll start with a proper look at your hair and an honest plan. Would you like us to find you a time[ with {stylist}]?",
  wa_other: "Hi {first_name}, this is Tara Rose Salons {branch}. It's been a little while since we saw you and we'd love to have you back. We see you, and we'd like to pick up[ with {stylist}] where you left off. Tell us what's been on your mind with your hair and we'll find you the right time. Is there a day that suits?",
  wa_catchall: "Hi {first_name}, this is Tara Rose Salons {branch}. It's been a little while since we saw you and we'd love to have you back. Tell us what's been on your mind with your hair and we'll find you the right time. Is there a day that suits?",
  sms_smoothing: "Hi {first_name}, Tara Rose {branch} here. It's been a while since your last smoothing. Want us to find you a time? Reply STOP to opt out.",
  sms_colour: "Hi {first_name}, Tara Rose {branch} here. We'd love to see you again for your colour. Want us to find you a time? Reply STOP to opt out.",
  sms_other: "Hi {first_name}, Tara Rose {branch} here. It's been a while and we'd love to have you back. Want us to find you a time? Reply STOP to opt out.",
};
const LQ_TOKENS = ['{first_name}', '{branch}', '{stylist}', '{month}'];

let lqSel = { tab: 'groups', view: 'send', ch: 'all', ty: 'all', br: 'all', sort: 'best', per: 20, mark: true, batch: 50 };
try { Object.assign(lqSel, JSON.parse(localStorage.getItem('trs-lost-queue') || '{}')); } catch (e) {}
const lqSave = () => { try { localStorage.setItem('trs-lost-queue', JSON.stringify(lqSel)); } catch (e) {} };
let lqData = null, lqRows = [], lqTpl = null, lqLoadedAt = 0, lqQuery = '', lqPage = 1, lqShown = [], lqBusy = false, lqErr = '', lqTplKey = 'wa_smoothing_lost', lqTplSample = 0;
const lqToday = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD on this computer's clock

// ── TABS (drawn by renderLostListsPage in lost-lists.js) ─────────────────────────────────────
function lqAllowed() { return typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3; }
function lqTabsHtml() {
  if (!lqAllowed()) return '';
  return `<div class="sc-seg lq-tabs" role="tablist" aria-label="Lost Clients">${[['groups', 'The five groups'], ['queue', 'To message'], ['tpl', 'Templates']]
    .map(([k, l]) => `<button type="button" role="tab" data-t="${k}" class="${lqSel.tab === k ? 'on' : ''}" onclick="lqShowTab('${k}')">${l}</button>`).join('')}</div>`;
}
function lqShowTab(t) {
  if (!lqAllowed()) t = 'groups';
  lqSel.tab = t; lqSave();
  document.querySelectorAll('.lq-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const g = document.getElementById('llHost'), q = document.getElementById('lqHost');
  if (g) g.hidden = t !== 'groups';
  if (q) q.hidden = t === 'groups';
  if (t === 'queue') lqRenderQueue(); else if (t === 'tpl') lqRenderTpl();
}
// Called once renderLostListsPage has drawn the page: open the tab the person left on.
function lqAfterRender() { if (lqAllowed() && lqSel.tab && lqSel.tab !== 'groups') lqShowTab(lqSel.tab); else lqShowTab('groups'); }

// ── DATA ─────────────────────────────────────────────────────────────────────────────────────
async function lqLoad(force) {
  if (lqData && !force && Date.now() - lqLoadedAt < 5 * 60e3) return;
  const [q, t] = await Promise.all([sb.rpc('lost_queue'), lqTpl && !force ? { data: lqTpl } : sb.rpc('lost_templates_get')]);
  if (q.error || !q.data || !Array.isArray(q.data.rows)) throw q.error || new Error('no queue');
  if (t.error || !Array.isArray(t.data)) throw t.error || new Error('no templates');
  lqData = q.data; lqTpl = t.data; lqLoadedAt = Date.now();
  lqPrep(lqData.rows);
}
// A client's name as she would say it: no brackets or stray dots, "SARA" -> "Sara".
function lqFirst(full) {
  const n = String(full || '').replace(/\(.*?\)/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
  let f = n.split(/\s+/)[0] || '';
  if (f && (f === f.toUpperCase() || f === f.toLowerCase())) f = f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
  const odd = !f || f.length < 2 || /[^A-Za-zÀ-ɏ'\-]/.test(f) || /\(/.test(full || '');
  return { f: f || String(full || ''), odd };
}
// Her usual stylist as the Staff Cards call her (first name), or '' when she has none, has left, or has no card (a stylist with no
// card may have left, and naming someone who has gone is worse than a message without a name), so the message drops "with ...".
function lqStylist(r) {
  const full = (lcTeam(r).hair || [])[0];
  if (!full) return '';
  const P = typeof STAFF_PROFILES !== 'undefined' ? STAFF_PROFILES : {};
  const key = typeof lcProfileKey === 'function' ? lcProfileKey(full) : '';
  const prof = key ? P[key] : null;
  if (!prof || prof.resigned) return '';
  const nm = key || full.split(/\s+/)[0];
  return nm.length <= 2 ? nm.toUpperCase() : nm.toLowerCase().replace(/(^|[\s-])(\w)/g, (m, a, c) => a + c.toUpperCase());   // HAZEL MAE -> Hazel Mae
}
function lqPrep(rows) {
  const seenPhone = {};
  rows.forEach(r => {
    const nm = lqFirst(r.client_name);
    r._first = nm.f; r._oddName = nm.odd;
    r._sty = lqStylist(r);
    r._ch = r.wa === 'text' ? 'sms' : 'whatsapp';
    r._phone = r.n_numbers === 1 && r.mobile ? String(r.mobile).split(' / ')[0] : '';
    r._dup = false; r._dupKeys = []; r._dupNames = [];
  });
  // One phone, one message: two clients on the same number (a mother and daughter) get the message once.
  rows.slice().sort((a, b) => (a.days_since - b.days_since)).forEach(r => {
    if (!r._phone) return;
    const first = seenPhone[r._phone];
    if (first) { r._dup = true; first._dupKeys.push(r.client_key); first._dupNames.push(r.client_name); }
    else seenPhone[r._phone] = r;
  });
  lqRows = rows.filter(r => !r._dup);
}

// ── THE MESSAGE ──────────────────────────────────────────────────────────────────────────────
const lqMonth = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
function lqTplKeyFor(r) {
  const t = r.qtype;
  if (r._ch === 'sms') return t.startsWith('smoothing') ? 'sms_smoothing' : t === 'colour' ? 'sms_colour' : 'sms_other';
  return { smoothing_lost: 'wa_smoothing_lost', smoothing_still: 'wa_smoothing_still', colour: 'wa_colour', other: 'wa_other', catchall: 'wa_catchall' }[t];
}
const lqBody = key => ((lqTpl || []).find(t => t.key === key) || {}).body || LQ_DEFAULTS[key] || '';
// [ with {stylist}] disappears when that token is empty; {stylist|our team} falls back to the words after the bar.
function lqFill(body, v) {
  const tok = /\{(\w+)(?:\|([^}]*))?\}/g;
  let s = body.replace(/\[([^\]]*)\]/g, (m, seg) => [...seg.matchAll(tok)].some(x => !v[x[1]]) ? '' : seg);
  s = s.replace(tok, (m, k, fb) => v[k] || fb || '');
  return s.replace(/\s+([.,?!])/g, '$1').replace(/ {2,}/g, ' ').trim();
}
function lqVars(r) {
  const month = r.qtype === 'colour' ? lqMonth([r.last_colour, r.last_toner].filter(Boolean).sort().pop()) : lqMonth(r.last_keratin);
  return { first_name: r._first, branch: LQ_SHORT[r.branch] || LC_BRANCH[r.branch] || r.branch, stylist: r._sty, month };
}
function lqMessage(r, bodyOverride) {
  let m = lqFill(bodyOverride || lqBody(lqTplKeyFor(r)), lqVars(r));
  if (r._ch === 'whatsapp') {
    if (r.wa === 'r18' && r.qtype !== 'smoothing_still') m = m.replace(', this is ', ", it's been a while since we last chatted, this is ");
    if (r.wa === 'noreply') m += LQ_STOP;
  }
  return m;
}

// ── TO MESSAGE ───────────────────────────────────────────────────────────────────────────────
async function lqRenderQueue(force) {
  const host = document.getElementById('lqHost');
  if (!host || lqSel.tab !== 'queue') return;
  if (!lqData || force) {
    host.innerHTML = '<p class="slv-muted">Loading the list…</p>';
    try { await lqLoad(force); lqErr = ''; } catch (e) { console.error(e); lqErr = 'The list did not load. Refresh to try again.'; }
  }
  if (lqErr) { host.innerHTML = `<p class="slv-muted">${lcEsc(lqErr)}</p>`; return; }
  lqPaint();
}
const lqIsReplied = r => r.messaged && r.replied;
function lqView(r) { return lqIsReplied(r) ? 'reply' : r.messaged ? 'sent' : 'send'; }
function lqBase() { return lqRows.filter(r => lqView(r) === lqSel.view); }
function lqFiltered(view) {
  const q = lqQuery.trim().toLowerCase();
  let out = lqRows.filter(r => lqView(r) === (view || lqSel.view)
    && (lqSel.ch === 'all' || r._ch === lqSel.ch) && (lqSel.ty === 'all' || r.qtype === lqSel.ty) && (lqSel.br === 'all' || r.branch === lqSel.br)
    && (!q || (r.client_name + ' ' + (r._sty || '') + ' ' + (r.stylist || '')).toLowerCase().includes(q)));
  if (lqSel.sort === 'name') out = out.slice().sort((a, b) => a.client_name.localeCompare(b.client_name));
  else if (lqSel.sort === 'oldest') out = out.slice().sort((a, b) => b.days_since - a.days_since);
  else out = out.slice().sort((a, b) => (LQ_WA_ORDER[a.wa] - LQ_WA_ORDER[b.wa]) || (LQ_TYPE_ORDER.indexOf(a.qtype) - LQ_TYPE_ORDER.indexOf(b.qtype)) || (a.days_since - b.days_since));
  return out;
}
function lqPaint() {
  const host = document.getElementById('lqHost');
  if (!host) return;
  const n = v => lqRows.filter(r => lqView(r) === v).length;
  const sk = (lqData && lqData.skipped) || {}, held = (lqData && lqData.held) || 0;
  const today = lqToday(), doneToday = lqRows.filter(r => r.messaged && String(r.sent_on || '').slice(0, 10) === today).length;
  const pct = Math.min(100, Math.round(100 * doneToday / lqSel.batch));
  const stat = (v, t, d) => `<button type="button" class="ll-card lq-stat${lqSel.view === v ? ' on' : ''}" onclick="lqSet('view','${v}')"><div class="ll-t">${t}</div><div class="ll-n">${lcNum(n(v))}</div><div class="ll-d">${d}</div></button>`;
  const brs = [...new Set(lqRows.map(r => r.branch))].sort();
  const chN = c => lqRows.filter(r => lqView(r) === lqSel.view && (c === 'all' || r._ch === c)).length;
  host.innerHTML = `
    <div class="ll-fresh">
      <span class="ll-chip">Sent is read from <b>respond.io</b> every night</span>
      <span class="ll-chip">Campaign started <b>${lcEsc(llDay(lqData.campaign_from))}</b></span>
      <button type="button" class="ll-chip lq-refresh" onclick="lqRenderQueue(true)" title="Fetch the list again">Refresh</button>
    </div>
    <div class="ll-cards lq-stats">
      ${stat('send', 'To send', 'one message each, best first')}
      ${stat('sent', 'Sent', 'waiting for a reply')}
      ${stat('reply', 'Replied', 'someone needs to answer')}
      <div class="ll-card lq-held" title="Booked clients are kept off every group"><div class="ll-t">Left out</div><div class="ll-n">${lcNum(held + (sk.nonum || 0) + (sk.blocked || 0) + (sk.unchecked || 0))}</div>
        <div class="ll-d">${lcNum(held)} booked · ${lcNum(sk.nonum || 0)} no number${sk.blocked ? ` · ${lcNum(sk.blocked)} blocked` : ''}${sk.unchecked ? ` · ${lcNum(sk.unchecked)} not checked yet` : ''}</div></div>
    </div>
    <section class="slv-card ll-panel">
      <div class="lq-batch"><div><b>Today's batch</b><div class="slv-note">Best first: WhatsApp active, smoothing, then colour.</div></div>
        <div class="lq-prog" role="img" aria-label="${doneToday} of ${lqSel.batch} sent today"><i style="width:${pct}%"></i></div>
        <div><b>${lcNum(doneToday)}</b> of <select class="ll-sel" onchange="lqSet('batch',+this.value)">${[25, 50, 100, 200].map(v => `<option${v === lqSel.batch ? ' selected' : ''}>${v}</option>`).join('')}</select> sent today</div></div>
      <div class="lc-tools ll-tools lq-tools">
        <div class="sc-seg" role="group" aria-label="Channel">${[['all', 'All'], ['whatsapp', 'WhatsApp'], ['sms', 'Text']].map(([k, l]) => `<button type="button" class="${lqSel.ch === k ? 'on' : ''}" onclick="lqSet('ch','${k}')">${l} ${lcNum(chN(k))}</button>`).join('')}</div>
        <select class="ll-sel" aria-label="Message" onchange="lqSet('ty',this.value)"><option value="all">All messages</option>${LQ_TYPE_ORDER.map(k => `<option value="${k}"${lqSel.ty === k ? ' selected' : ''}>${lcEsc(LQ_TYPES[k][0])}</option>`).join('')}</select>
        <select class="ll-sel" aria-label="Branch" onchange="lqSet('br',this.value)"><option value="all">All branches</option>${brs.map(b => `<option value="${b}"${lqSel.br === b ? ' selected' : ''}>${lcEsc(LC_BRANCH[b] || b)}</option>`).join('')}</select>
        <select class="ll-sel" aria-label="Order" onchange="lqSet('sort',this.value)">${[['best', 'Best first'], ['oldest', 'Lost longest first'], ['name', 'Name A to Z']].map(([k, l]) => `<option value="${k}"${lqSel.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input type="search" class="ll-search" id="lqSearch" placeholder="Search name or stylist" value="${lcEsc(lqQuery)}" oninput="lqQuery=this.value;lqPage=1;lqPaintTable()">
        <span style="flex:1"></span>
        <button type="button" class="tglr lc-btn" onclick="lqSaveFile('xlsx')" title="Download what is shown, with the message for each">XLSX</button>
        <button type="button" class="tglr lc-btn" onclick="lqSaveFile('csv')" title="Download what is shown, with the message for each">CSV</button>
        <span id="lqNote" class="slv-note" style="display:inline"></span>
      </div>
      <label class="ll-hide lq-auto"><input type="checkbox" ${lqSel.mark ? 'checked' : ''} onchange="lqSel.mark=this.checked;lqSave()"> Mark a client as sent when I open WhatsApp or copy her message</label>
      <p id="lqCount" class="slv-note"></p>
      <div id="lqTable"></div>
      <p class="slv-muted ll-foot">One message per client, first match wins: smoothing, then colour, then other services, then everyone else. Someone in several groups appears once.
      Sent comes from respond.io (it only sees messages sent through it); a text, or WhatsApp opened from here, is marked by the button. A client with a booking leaves the list on her own. Two clients on one number get one message.</p>
    </section>`;
  lqPaintTable();
}
function lqSet(k, v) { lqSel[k] = v; lqPage = 1; lqSave(); lqPaint(); }

function lqPaintTable() {
  const box = document.getElementById('lqTable');
  if (!box) return;
  const rows = lqFiltered(), per = LL_PER.includes(lqSel.per) ? lqSel.per : 20;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  lqPage = Math.min(Math.max(1, lqPage), pages);
  const shown = rows.slice((lqPage - 1) * per, lqPage * per);
  lqShown = shown;
  const cnt = document.getElementById('lqCount');
  if (cnt) cnt.textContent = `${lcNum(rows.length)} shown of ${lcNum(lqBase().length)}`;
  const view = lqSel.view;
  const two = r => r.n_numbers > 1 ? ' <span class="lc-2nums" tabindex="0" title="More than one number under this name in Phorest, so the number may be someone else\'s. Check before you send.">2 numbers?</span>' : '';
  const flags = r => (r._oddName ? ' <span class="ll-tag" title="Her name has brackets or odd characters, so the greeting may read oddly">check name</span>' : '')
    + (r._dupNames.length ? ` <span class="ll-tag" title="Same number: ${lcEsc(r._dupNames.join(', '))}">+ ${lcEsc(r._dupNames.join(', '))}</span>` : '');
  const chan = r => `<span class="ll-pill ${r._ch === 'sms' ? 'll-txt' : 'll-act'}">${r._ch === 'sms' ? 'Text' : 'WhatsApp'}</span>`;
  const msgCell = (r, i) => { const m = lqMessage(r); return `<div class="lq-msg" title="${lcEsc(m)}">${lcEsc(m)}</div>${r._ch === 'sms' ? `<div class="slv-note${m.length > 160 ? ' lq-long' : ''}">${m.length} characters${m.length > 160 ? ', more than one text' : ''}</div>` : ''}`; };
  const act = (r, i) => {
    if (view === 'send') {
      const wa = r._ch === 'whatsapp' && r._phone
        ? `<button type="button" class="tglr lc-btn lq-pri" onclick="lqOpen(${i})">Open in WhatsApp</button><button type="button" class="tglr lc-btn" onclick="lqCopy(${i})">Copy message</button>`
        : `<button type="button" class="tglr lc-btn lq-pri" onclick="lqCopy(${i})">${r._ch === 'sms' ? 'Copy text' : 'Copy message'}</button>`;
      return `<div class="lq-acts">${wa}<button type="button" class="tglr lc-btn" onclick="lqMarkOne(${i})" title="I sent this one">Mark sent</button></div>`;
    }
    const by = r.sent_by === 'respond.io' ? 'via respond.io' : `marked by ${lcEsc(r.sent_by || 'someone')}`;
    const when = `Sent ${lcEsc(llDayS(r.sent_on))} <span class="slv-note">${by}</span>`;
    if (view === 'reply') return `<div class="lq-rep">Replied ${lcEsc(llDayS(r.last_in))}</div><div class="slv-note">${when}. Answer in respond.io.</div>`;
    return `<div class="lq-sent">${when}</div>${r.by_mark ? `<button type="button" class="tglr lc-btn" onclick="lqUnmark(${i})">Undo</button>` : ''}`;
  };
  const tr = shown.map((r, i) => `<tr>
      <td>${lcEsc(r.client_name)}${two(r)}${flags(r)}<div class="slv-note">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(r.area)}</div></td>
      <td><span class="ll-tag lq-type">${lcEsc(LQ_TYPES[r.qtype][0])}</span><div class="slv-note">${lcEsc(LQ_TYPES[r.qtype][1])}${(r.also_on || []).length > 1 ? ` · in ${r.also_on.length} groups` : ''}</div></td>
      <td>${chan(r)}<div class="lq-st">${llStatus(r)}</div></td>
      <td class="ll-team">${lcTeam(r).hair[0] ? lcStylist(lcTeam(r).hair[0]) : '<span class="slv-muted">none</span>'}${lcTeam(r).hair[0] && !r._sty ? '<div class="slv-note" title="Left, or no Staff Card, so the message does not name her">not named</div>' : ''}</td>
      <td class="ll-ph">${lcPhone(r)}</td>
      <td class="lq-msgtd">${msgCell(r, i)}</td>
      <td class="lq-acttd">${act(r, i)}</td></tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${two(r)}</span><span>${chan(r)}</span></div>
      <div class="prd-meta">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(LQ_TYPES[r.qtype][0])} · ${llStatus(r)}</div>
      <div class="prd-meta" style="margin-top:4px">${lcPhone(r)}${r._sty ? ' · ' + lcEsc(r._sty) : ''}</div>
      <div class="lq-msg lq-msg-m">${lcEsc(lqMessage(r))}</div>
      <div style="margin-top:8px">${act(r, i)}</div></div></li>`).join('');
  const from = (lqPage - 1) * per + 1;
  box.innerHTML = `<div class="slv-wrap prd-desk lc-wrap ll-wrap"><table class="slv-table"><thead><tr><th>Client</th><th>Message</th><th>Channel</th><th>Usual stylist</th><th>Phone</th><th>What she gets</th><th></th></tr></thead>
      <tbody>${tr || `<tr><td colspan="7" class="slv-muted">${view === 'send' ? 'Nobody left to send to with these filters.' : 'Nobody here yet.'}</td></tr>`}</tbody></table></div>
      <ol class="prd-cards">${cards || '<li class="slv-muted">Nobody here with these filters.</li>'}</ol>
      ${rows.length ? `<div class="lc-pager">
        <div class="lc-pg-size"><span class="slv-note">Show</span><div class="sc-seg" role="group" aria-label="Rows per page">${LL_PER.map(v => `<button type="button" class="${v === per ? 'on' : ''}" onclick="lqSel.per=${v};lqPage=1;lqSave();lqPaintTable()">${v}</button>`).join('')}</div></div>
        <div class="lc-pg-nav"><span class="lc-pg-txt">Page <b>${lqPage}</b> of <b>${lcNum(pages)}</b><span class="slv-note"> · ${lcNum(from)}–${lcNum(from + shown.length - 1)} of ${lcNum(rows.length)}</span></span>
          <button type="button" class="tglr" onclick="lqGo(-1)"${lqPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
          <button type="button" class="tglr" onclick="lqGo(1)"${lqPage >= pages ? ' disabled' : ''}>Next ›</button></div></div>` : ''}`;
}
function lqGo(d) { lqPage += d; lqPaintTable(); const b = document.getElementById('lqTable'); if (b && b.getBoundingClientRect().top < 0) scrollTo({ top: scrollY + b.getBoundingClientRect().top - 180 }); }
function lqNote(t) { const n = document.getElementById('lqNote'); if (n) n.textContent = t; }

// ── SENDING AND MARKING ──────────────────────────────────────────────────────────────────────
async function lqMark(rows) {
  const keys = rows.flatMap(r => [r.client_key].concat(r._dupKeys));
  const was = rows.map(r => ({ r, m: r.messaged, on: r.sent_on, by: r.sent_by, bm: r.by_mark }));
  rows.forEach(r => { r.messaged = true; r.sent_on = lqToday(); r.sent_by = 'you'; r.by_mark = true; r.replied = false; });
  lqPaint();
  const { error } = await sb.rpc('lost_queue_mark', { p_keys: keys });
  if (error) { console.error(error); was.forEach(w => { w.r.messaged = w.m; w.r.sent_on = w.on; w.r.sent_by = w.by; w.r.by_mark = w.bm; }); lqPaint(); lqNote('That did not save. Try again.'); }
}
const lqMarkOne = i => lqMark([lqShown[i]]);
async function lqUnmark(i) {
  const r = lqShown[i];
  const { error } = await sb.rpc('lost_queue_unmark', { p_keys: [r.client_key].concat(r._dupKeys) });
  if (error) { console.error(error); lqNote('That did not save. Try again.'); return; }
  await lqRenderQueue(true);
}
function lqOpen(i) {
  const r = lqShown[i];
  if (!r || !r._phone) return;
  const digits = r._phone.replace(/\D/g, '');
  window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(lqMessage(r)), '_blank', 'noopener');
  if (lqSel.mark) lqMark([r]);
}
async function lqCopy(i) {
  const r = lqShown[i];
  if (!r) return;
  try { await navigator.clipboard.writeText(lqMessage(r)); } catch (e) { lqNote('The browser would not copy. Use the file instead.'); return; }
  lqNote(`Copied the message for ${r.client_name}`);
  if (lqSel.mark) lqMark([r]);
}
function lqSaveFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const rows = lqFiltered();
  const head = ['Client', 'Phone', 'Channel', 'Message type', 'WhatsApp status', 'Branch', 'Usual stylist', 'Groups', 'Message', 'Notes'];
  const lines = rows.map(r => [r.client_name, r._phone || r.mobile || '', r._ch === 'sms' ? 'Text' : 'WhatsApp', LQ_TYPES[r.qtype][0], (LL_ST[r.wa] || [])[1] || r.wa,
    LC_BRANCH[r.branch] || r.branch, r._sty, (r.also_on || []).join(', '), lqMessage(r),
    [r._oddName ? 'check first name' : '', r.n_numbers > 1 ? '2+ numbers in Phorest' : '', r._dupNames.length ? 'same number as ' + r._dupNames.join(', ') : ''].filter(Boolean).join('; ')]);
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-lists.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: 'To message', blocks: [{ cols: head.map(h => ({ label: h, fmt: 'text' })), rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['lost-clients-to-message', lqSel.view, new Date().toISOString().slice(0, 10)].join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  lqNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}

// ── TEMPLATES ────────────────────────────────────────────────────────────────────────────────
async function lqRenderTpl(force) {
  const host = document.getElementById('lqHost');
  if (!host || lqSel.tab !== 'tpl') return;
  if (!lqTpl || !lqData || force) {
    host.innerHTML = '<p class="slv-muted">Loading the templates…</p>';
    try { await lqLoad(force); lqErr = ''; } catch (e) { console.error(e); lqErr = 'The templates did not load. Refresh to try again.'; }
  }
  if (lqErr) { host.innerHTML = `<p class="slv-muted">${lcEsc(lqErr)}</p>`; return; }
  lqPaintTpl();
}
function lqTplType(key) { return { wa_smoothing_lost: 'smoothing_lost', wa_smoothing_still: 'smoothing_still', wa_colour: 'colour', wa_other: 'other', wa_catchall: 'catchall', sms_smoothing: 'smoothing_lost', sms_colour: 'colour', sms_other: 'other' }[key]; }
// Real clients the preview can use: the first few on the list that get this template.
function lqSamples(key) {
  const t = lqTplType(key), ch = key.startsWith('sms') ? 'sms' : 'whatsapp';
  const ok = r => (r._ch === ch) && (key === 'sms_smoothing' || key === 'wa_smoothing_lost' ? r.qtype.startsWith('smoothing') && (key === 'sms_smoothing' || r.qtype === 'smoothing_lost')
    : key === 'sms_other' ? (r.qtype === 'other' || r.qtype === 'catchall') : r.qtype === t);
  const all = lqRows.filter(ok);
  // some with a stylist and some without, so both shapes of the message show
  return all.filter(r => r._sty).slice(0, 4).concat(all.filter(r => !r._sty).slice(0, 2));
}
function lqPaintTpl() {
  const host = document.getElementById('lqHost');
  if (!host) return;
  const t = lqTpl.find(x => x.key === lqTplKey) || lqTpl[0];
  lqTplKey = t.key;
  const sms = t.channel === 'sms';
  host.innerHTML = `
    <div class="lq-tplgrid">
      <div class="lq-tpllist slv-card" role="tablist" aria-label="Templates">${lqTpl.map(x => `<button type="button" role="tab" class="lq-tli${x.key === t.key ? ' on' : ''}" onclick="lqPickTpl('${x.key}')"><span class="lq-tn">${lcEsc(x.name)}</span><span class="slv-note">${x.channel === 'sms' ? 'Text' : 'WhatsApp'} · ${lcEsc(x.who)}</span></button>`).join('')}</div>
      <section class="slv-card lq-ed">
        <div class="slv-head"><div><div class="slv-eyebrow">${sms ? 'Text' : 'WhatsApp'} · ${lcEsc(t.who)}</div><h3>${lcEsc(t.name)}</h3></div></div>
        <p class="slv-note">Edit the words, keep the {tokens}. A part in [square brackets] is left out when it has no value: [ with {stylist}] disappears for a client with no usual stylist (or one who has left). {stylist|our team} uses the words after the bar instead. The list uses what you save straight away.</p>
        <div class="lq-toks">${LQ_TOKENS.map(k => `<button type="button" class="ll-tag lq-tok" onclick="lqInsert('${k}')">${k}</button>`).join('')}</div>
        <textarea id="lqTa" class="lq-ta" rows="7" oninput="lqPreview()">${lcEsc(t.body)}</textarea>
        <div class="lq-edrow"><span class="slv-note" id="lqCnt"></span><span style="flex:1"></span>
          <button type="button" class="tglr lc-btn" onclick="lqResetTpl()">Reset to the original</button>
          <button type="button" class="tglr lc-btn lq-pri" id="lqSaveBtn" onclick="lqSaveTpl()">Save</button></div>
        <div class="lq-edrow"><span class="slv-note">Preview for</span><select class="ll-sel" id="lqWho" onchange="lqTplSample=+this.value;lqPreview()"></select></div>
        <div class="lq-bubble" id="lqPrev"></div>
        <p class="slv-note" id="lqUpd">${t.updated_by ? `Last changed ${lcEsc(llDayS(t.updated_at))} by ${lcEsc(t.updated_by)}.` : 'Original wording, checked against the brand rules on 9 Oct 2026.'}</p>
        <p class="ll-def">${sms
          ? 'A text is one message up to 160 characters, so keep it short. It always carries the opt-out line. Where texts are sent from (and the sender name) is set up outside this page.'
          : 'WhatsApp only lets us start a chat with someone who has not written in the last 24 hours using a message Meta has approved, so a changed wording has to be approved in respond.io before it is sent there. Added automatically: for "Replied 12 to 18 months ago" the opening becomes "it\'s been a while since we last chatted, this is ...", and for "No reply seen" the message ends with "' + lcEsc(LQ_STOP.trim()) + '"'}</p>
      </section>
    </div>`;
  lqFillWho();
  lqPreview();
}
function lqPickTpl(k) { lqTplKey = k; lqTplSample = 0; lqPaintTpl(); }
function lqFillWho() {
  const sel = document.getElementById('lqWho');
  if (!sel) return;
  const s = lqSamples(lqTplKey);
  sel.innerHTML = s.length ? s.map((r, i) => `<option value="${i}"${i === lqTplSample ? ' selected' : ''}>${lcEsc(r._first)} · ${lcEsc(LQ_SHORT[r.branch] || r.branch)} · ${r._sty ? lcEsc(r._sty) : 'no stylist'}</option>`).join('') : '<option>No client on the list uses this one</option>';
}
function lqPreview() {
  const ta = document.getElementById('lqTa'), out = document.getElementById('lqPrev');
  if (!ta || !out) return;
  const s = lqSamples(lqTplKey), r = s[lqTplSample] || s[0];
  const m = r ? lqMessage(r, ta.value) : lqFill(ta.value, { first_name: 'Sara', branch: 'Saadiyat', stylist: 'Nikki', month: 'August 2025' });
  out.textContent = m;
  const c = document.getElementById('lqCnt'), sms = lqTplKey.startsWith('sms');
  if (c) c.textContent = sms ? `${m.length} characters when filled in (one text is 160)` : `${m.length} characters when filled in`;
  const dirty = ta.value.trim() !== ((lqTpl.find(x => x.key === lqTplKey) || {}).body || '').trim();
  const b = document.getElementById('lqSaveBtn');
  if (b) b.disabled = !dirty;
}
function lqInsert(tok) {
  const ta = document.getElementById('lqTa');
  if (!ta) return;
  const a = ta.selectionStart, z = ta.selectionEnd;
  ta.value = ta.value.slice(0, a) + tok + ta.value.slice(z);
  ta.focus(); ta.selectionStart = ta.selectionEnd = a + tok.length;
  lqPreview();
}
function lqResetTpl() { const ta = document.getElementById('lqTa'); if (ta) { ta.value = LQ_DEFAULTS[lqTplKey] || ta.value; lqPreview(); } }
async function lqSaveTpl() {
  const ta = document.getElementById('lqTa'), b = document.getElementById('lqSaveBtn'), u = document.getElementById('lqUpd');
  if (!ta) return;
  if (b) b.disabled = true;
  const { error } = await sb.rpc('lost_template_save', { p_key: lqTplKey, p_body: ta.value });
  if (error) { console.error(error); if (u) u.textContent = 'That did not save. A message is 10 to 900 characters.'; if (b) b.disabled = false; return; }
  const t = lqTpl.find(x => x.key === lqTplKey);
  if (t) { t.body = ta.value.trim(); t.updated_at = new Date().toISOString(); t.updated_by = 'you'; }
  if (u) u.textContent = 'Saved. The To message list uses it now. Run new wording through /brand-review before a big send.';
  lqPreview();
}
