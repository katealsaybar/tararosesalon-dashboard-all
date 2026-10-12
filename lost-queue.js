// Lost Clients, To message and Templates tabs (Kate, 9 Oct 2026). The five groups overlap (group 4 is everyone), so this is the
// one running list built from them: every client who can be messaged, ONE message each, first match wins:
// group 3 -> colour (with the welcome-back rate offer to 31 October 2026, Kate 9 Oct), then groups 1 or 2 -> smoothing, group 5 -> other services, group 4 only -> everyone else.
// The list and its message types come from lost_queue() (migrations/lost_queue.sql); the wording of the six messages (three, each as WhatsApp and text) is in
// lost_templates, edited from the Templates tab. Level 3 and above (it shows phone numbers).
//
// Sent is read from respond.io (the last message we sent that number, on or after lost_lists_config.campaign_from) and, for a
// message sent outside it (a text, or WhatsApp opened from a link here), from a "Sent" mark kept in lost_messaged with list_id 'q'.
// Replied = she wrote to us on or after the day we messaged her.
//
// Borrows lost-lists.js (llStatus pills, LL_ST, LL_PER) and lost-clients.js (lcEsc, lcNum, lcPhone, lcTeam, lcProfileKey,
// LC_BRANCH) and the XLSX writer (lgx*), so it needs to be loaded after both.
// Kate, 12 Oct 2026: three messages, each as WhatsApp and as a text (Coach Emma's pre-approved set): Smoothing, Colour and Due.
// lost_queue() still sorts clients into its five kinds; lqPrep folds them into these three (the two smoothing kinds are Smoothing;
// other services and everyone else are Due).
const LQ_TYPES = {
  smoothing: ['Smoothing', 'Groups 1 and 2'],
  colour:    ['Colour', 'Group 3'],
  due:       ['Due', 'Everyone else'],
};
const LQ_TYPE_ORDER = ['smoothing', 'colour', 'due'];
const LQ_KIND = { smoothing_lost: 'smoothing', smoothing_still: 'smoothing', colour: 'colour', other: 'due', catchall: 'due' };
const LQ_WA_ORDER = { act: 0, r18: 1, noreply: 2, text: 3 };
const LQ_SHORT = { SAA: 'Saadiyat', KCA: 'Khalifa City', MC: 'Motor City', AQ: 'Al Quoz' };   // how a client is told the branch (not "Khalifa City A")
const LQ_STOP = " If you'd rather not hear from us, just reply STOP.";
// The wording the Templates tab resets to (the same as the rows seeded in migrations/lost_queue.sql).
const LQ_DEFAULTS = {
  wa_smoothing: "Hi {first_name}, it's Tara Rose {branch}. You've been on our minds.\n\nYour last smoothing[ with {stylist}] was back in {month}, and smoothing softens over time. We'd love to see how your hair is feeling now, and we'll tell you honestly what it needs, even if the answer is \"not yet\".\n\nBecause we've missed you, your next smoothing is 30% off until 31 October.\n\nShall we find you a time? 🤍",
  wa_colour: "Hi {first_name}, it's Tara Rose {branch}. You've been on our minds.\n\nYour last colour[ with {stylist}] was in {month}, and a lot can change in a few months. Hair grows, tones soften, and sometimes you just fancy something different.\n\nWe'd also like to introduce you to our new stylists. We'll start by looking at your hair together and build a plan around you.\n\nAs a welcome back, your next colour is 20% off until 31 October.\n\nShall we find you a time[ with {stylist}]? 🤍",
  wa_due: "Hi {first_name}, it's Tara Rose {branch}. We've missed you.\n\nIt's been a little while since we saw you[ with {stylist}]. Tell us what's been on your mind, whether that's a fresh cut, a colour refresh or a catch-up, and we'll find a time that suits you.\n\nWe'd love to have you back in the chair. 🤍",
  sms_smoothing: "Hi {first_name}, it's Tara Rose {branch}. We've missed you. Your last smoothing[ with {stylist}] was back in {month}, and until 31 October you can have 30% off your next one. We'll look at your hair first and tell you honestly what it needs. Shall we find you a time?",
  sms_colour: "Hi {first_name}, it's Tara Rose {branch}. We've been thinking of you. Your last colour[ with {stylist}] was in {month}, and until 31 October you can have 20% off your next one, plus a chance to meet our new stylists. Shall we find you a time[ with {stylist}]?",
  sms_due: "Hi {first_name}, it's Tara Rose {branch}. We've missed you. It's been a little while and we think you're due a visit[ with {stylist}]. Tell us what you'd like to do with your hair and we'll find the right time.",
};
const LQ_TOKENS = ['{first_name}', '{branch}', '{stylist}', '{month}'];

let lqSel = { tab: 'groups', view: 'send', ch: 'all', ty: 'all', br: 'all', st: 'all', sty: 'all', ph: 'all', sort: 'best', per: 20, batch: 50 };
try { Object.assign(lqSel, JSON.parse(localStorage.getItem('trs-lost-queue') || '{}')); } catch (e) {}
const lqSave = () => { try { localStorage.setItem('trs-lost-queue', JSON.stringify(lqSel)); } catch (e) {} };
let lqData = null, lqRows = [], lqTpl = null, lqLoadedAt = 0, lqQuery = '', lqPage = 1, lqShown = [], lqBusy = false, lqErr = '', lqTplKey = 'wa_smoothing', lqTplSample = 0;
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
  if (typeof trSyncUrl === 'function') trSyncUrl(null);   // the address names the tab: ?view=lost-clients&tab=templates
  document.querySelectorAll('.lq-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const g = document.getElementById('llHost'), q = document.getElementById('lqHost');
  if (g) g.hidden = t !== 'groups';
  if (q) q.hidden = t === 'groups';
  if (t === 'queue') lqRenderQueue(); else if (t === 'tpl') lqRenderTpl();
}
// Called once renderLostListsPage has drawn the page: open the tab the person left on.
// The address bar names the tab (Kate, 12 Oct 2026): ?view=lost-clients&tab=templates. Slugs: groups, to-message, templates.
const LQ_SLUG = { groups: 'groups', queue: 'to-message', tpl: 'templates' };
function lqUrlParts() { return lqAllowed() && LQ_SLUG[lqSel.tab] ? ['tab=' + LQ_SLUG[lqSel.tab]] : []; }
function lqTabFromUrl() {
  try { const s = new URLSearchParams(location.search).get('tab'); return Object.keys(LQ_SLUG).find(k => LQ_SLUG[k] === s) || ''; } catch (e) { return ''; }
}
function lqAfterRender() {
  // A link that names its tab wins over the one she left on; a bare link opens the remembered one.
  const t = lqAllowed() ? (lqTabFromUrl() || lqSel.tab) : 'groups';
  lqShowTab(t && LQ_SLUG[t] ? t : 'groups');
}

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
    r.qtype = LQ_KIND[r.qtype] || r.qtype || 'due';
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
  return (r._ch === 'sms' ? 'sms_' : 'wa_') + r.qtype;
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
    if (r.wa === 'r18') m = m.replace(', this is ', ", it's been a while since we last chatted, this is ");
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
    && (lqSel.st === 'all' || r.wa === lqSel.st)
    && (lqSel.sty === 'all' || (lqSel.sty === 'named' ? !!r._sty : !r._sty))
    && (lqSel.ph === 'all' || r.n_numbers <= 1)
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
  const taken = (lqData && lqData.excluded) || 0, reviewed = Object.keys((lqData && lqData.review) || {}).length;
  const today = lqToday(), doneToday = lqRows.filter(r => r.messaged && String(r.sent_on || '').slice(0, 10) === today).length;
  const pct = Math.min(100, Math.round(100 * doneToday / lqSel.batch));
  const stat = (v, t, d) => `<button type="button" class="ll-card lq-stat${lqSel.view === v ? ' on' : ''}" onclick="lqSet('view','${v}')"><div class="ll-t">${t}</div><div class="ll-n">${lcNum(n(v))}</div><div class="ll-d">${d}</div></button>`;
  const brs = [...new Set(lqRows.map(r => r.branch))].sort();
  const chN = c => lqRows.filter(r => lqView(r) === lqSel.view && (c === 'all' || r._ch === c)).length;
  host.innerHTML = `
    <div class="ll-fresh">
      <span class="ll-chip">Sent is read from <b>respond.io</b> every night</span>
      <span class="ll-chip">Campaign started <b>${lcEsc(llDay(lqData.campaign_from))}</b></span>
      <span class="ll-chip${reviewed < 4 ? ' warn' : ' ok'}" title="Coordinators mark their branch reviewed on the Lost Clients groups tab">Branches reviewed <b>${reviewed} of 4</b></span>
      <button type="button" class="ll-chip lq-refresh" onclick="lqRenderQueue(true)" title="Fetch the list again">Refresh</button>
    </div>
    <div class="ll-cards lq-stats">
      ${stat('send', 'To send', 'one message each, best first')}
      ${stat('sent', 'Sent', 'waiting for a reply')}
      ${stat('reply', 'Replied', 'someone needs to answer')}
      <div class="ll-card lq-held" title="Booked clients, and clients the coordinators took out, are kept off To message"><div class="ll-t">Left out</div><div class="ll-n">${lcNum(held + taken + (sk.nonum || 0) + (sk.blocked || 0) + (sk.unchecked || 0))}</div>
        <div class="ll-d">${lcNum(held)} booked · ${lcNum(taken)} taken out · ${lcNum(sk.nonum || 0)} no number${sk.blocked ? ` · ${lcNum(sk.blocked)} blocked` : ''}${sk.unchecked ? ` · ${lcNum(sk.unchecked)} not checked yet` : ''}</div></div>
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
        <span class="lq-btns">
          <button type="button" class="tglr lc-btn" onclick="lqSaveFile('xlsx')" title="Download what is shown, with the message for each">XLSX</button>
          <button type="button" class="tglr lc-btn" onclick="lqSaveFile('csv')" title="Download what is shown, with the message for each">CSV</button>
          <button type="button" class="tglr lc-btn" onclick="lqUpPick()" title="Upload the file back after you filled in Sent? or Take out?: you see what changes before anything does">Upload</button>
          <input type="file" id="lqUpFile" accept=".xlsx,.csv" hidden onchange="lqUpOnFile(this)">
        </span>
        <span id="lqNote" class="slv-note" style="display:inline"></span>
      </div>
      <div id="lqUpPanel"></div>
      <p id="lqCount" class="slv-note"></p>
      <div id="lqTable"></div>
      <p class="slv-muted ll-foot">One message per client, first match wins: smoothing, then colour, then other services, then everyone else. Someone in several groups appears once.
      Sent comes from respond.io (it only sees messages sent through it); a text, or WhatsApp opened from here, is marked by the button. A client with a booking leaves the list on her own. Two clients on one number get one message.</p>
    </section>`;
  lqPaintTable();
}
function lqSet(k, v) { lqSel[k] = v; lqPage = 1; lqSave(); lqPaint(); }
// Heading menus (Kate, 12 Oct 2026: "the headers should be filterable"): the same menus as the five groups' table, opened by
// lost-lists.js's llMenu with a q- key. A choice repaints the table and the controls above it and keeps the menu open.
function lqMenuSet(k, v) { lqSet(k, v); llFillPop(); }
function lqFillPop(key) {
  const rows = lqBase();
  const opt = (on, label, fn, n) => `<button type="button" class="ll-opt${on ? ' on' : ''}" onclick="${fn}"><span class="ll-tick" aria-hidden="true">${on ? '✓' : ''}</span>${label}${n != null ? ` <em>${lcNum(n)}</em>` : ''}</button>`;
  const pick = (k, v, label, n) => opt(lqSel[k] === v, label, `lqMenuSet('${k}','${v}')`, n);
  const cnt = f => rows.filter(f).length;
  if (key === 'q-client') {
    const brs = [...new Set(lqRows.map(r => r.branch))].sort();
    return '<div class="ll-pt">Branch</div>' + pick('br', 'all', 'All branches', rows.length) + brs.map(b => pick('br', b, lcEsc(LC_BRANCH[b] || b), cnt(r => r.branch === b))).join('')
      + '<div class="ll-pt">Sort</div>' + [['best', 'Best first'], ['oldest', 'Lost longest first'], ['name', 'Name A to Z']].map(([v, l]) => pick('sort', v, l)).join('');
  }
  if (key === 'q-message') {
    return '<div class="ll-pt">Message</div>' + pick('ty', 'all', 'All messages', rows.length) + LQ_TYPE_ORDER.map(k => pick('ty', k, lcEsc(LQ_TYPES[k][0]), cnt(r => r.qtype === k))).join('');
  }
  if (key === 'q-channel') {
    return '<div class="ll-pt">Channel</div>' + pick('ch', 'all', 'Both', rows.length) + pick('ch', 'whatsapp', 'WhatsApp', cnt(r => r._ch === 'whatsapp')) + pick('ch', 'sms', 'Text', cnt(r => r._ch === 'sms'))
      + '<div class="ll-pt">WhatsApp status</div>' + pick('st', 'all', 'Any status') + LL_ST_ORDER.filter(s => cnt(r => r.wa === s)).map(s => pick('st', s, lcEsc(LL_ST[s][1]), cnt(r => r.wa === s))).join('');
  }
  if (key === 'q-stylist') {
    return '<div class="ll-pt">Usual stylist</div>' + pick('sty', 'all', 'Everyone', rows.length) + pick('sty', 'named', 'Named in the message', cnt(r => !!r._sty)) + pick('sty', 'none', 'No stylist named', cnt(r => !r._sty));
  }
  if (key === 'q-phone') {
    return '<div class="ll-pt">Phone</div>' + pick('ph', 'all', 'All', rows.length) + pick('ph', 'single', 'Hide names with more than one number', cnt(r => r.n_numbers <= 1))
      + '<div class="ll-pt ll-pn">A name that matches more than one client in Phorest may carry someone else\'s number.</div>';
  }
  return '';
}

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
  const th = (label, k, marked) => `<th><button type="button" class="ll-thb${marked ? ' on' : ''}" onclick="llMenu(event,'${k}')" aria-haspopup="dialog" title="Filter or sort">${lcEsc(label)} <span aria-hidden="true">▾</span></button></th>`;
  const heads = th('Client', 'q-client', lqSel.br !== 'all' || lqSel.sort !== 'best') + th('Message', 'q-message', lqSel.ty !== 'all')
    + th('Channel', 'q-channel', lqSel.ch !== 'all' || lqSel.st !== 'all') + th('Usual stylist', 'q-stylist', lqSel.sty !== 'all')
    + th('Phone', 'q-phone', lqSel.ph !== 'all') + '<th>What she gets</th><th></th>';
  box.innerHTML = `<div class="slv-wrap prd-desk lc-wrap ll-wrap"><table class="slv-table"><thead><tr>${heads}</tr></thead>
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
}
async function lqCopy(i) {
  const r = lqShown[i];
  if (!r) return;
  try { await navigator.clipboard.writeText(lqMessage(r)); } catch (e) { lqNote('The browser would not copy. Use the file instead.'); return; }
  lqNote(`Copied the message for ${r.client_name}`);
}
function lqSaveFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const rows = lqFiltered();
  const head = ['Client', 'Phone', 'Channel', 'Message type', 'WhatsApp status', 'Branch', 'Usual stylist', 'Groups', 'Message', 'Notes', 'Sent?', 'Take out?', 'Note', 'Client key (do not change)'];
  const lines = rows.map(r => [r.client_name, r._phone || r.mobile || '', r._ch === 'sms' ? 'Text' : 'WhatsApp', LQ_TYPES[r.qtype][0], (LL_ST[r.wa] || [])[1] || r.wa,
    LC_BRANCH[r.branch] || r.branch, r._sty, (r.also_on || []).join(', '), lqMessage(r),
    [r._oddName ? 'check first name' : '', r.n_numbers > 1 ? '2+ numbers in Phorest' : '', r._dupNames.length ? 'same number as ' + r._dupNames.join(', ') : ''].filter(Boolean).join('; '),
    r.messaged ? 'Yes' : '', '', '', r.client_key]);
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-lists.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: 'To message', blocks: [{ cols: head.map(h => ({ label: h, fmt: 'text' })), rows: out.map(l => ({ cells: l })) }] }] });
  // The name says what is in it (Kate, 12 Oct 2026: she downloaded Al Quoz and the file did not say so).
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = ['lost-clients-to-message', { send: 'to-send', sent: 'sent', reply: 'replied' }[lqSel.view] || lqSel.view,
    lqSel.br !== 'all' ? slug(LC_BRANCH[lqSel.br] || lqSel.br) : '', lqSel.ch !== 'all' ? (lqSel.ch === 'sms' ? 'text' : 'whatsapp') : '',
    lqSel.ty !== 'all' ? slug(LQ_TYPES[lqSel.ty][0]) : '', lqSel.st !== 'all' ? slug((LL_ST[lqSel.st] || [])[1] || lqSel.st) : '',
    lqSel.sty !== 'all' ? (lqSel.sty === 'named' ? 'stylist-named' : 'no-stylist') : '', lqSel.ph !== 'all' ? 'one-number' : '',
    lqQuery.trim() ? 'search' : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  lqNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}

// ── UPLOAD (Kate, 12 Oct 2026: "an upload button to keep updating the sheet") ──────────────────────
// The file from XLSX or CSV comes back with Sent? (Yes = she was messaged outside this page, e.g. a respond.io broadcast) and
// Take out? (one of the five reasons) and Note filled in. A preview first, then Apply: Sent? goes to lost_queue_mark (the same as the
// Mark sent button), Take out? to lost_exclude_bulk (the same as the groups page). A client not on the list any more is skipped.
let lqUpPlan = null;
function lqUpPick() { const f = document.getElementById('lqUpFile'); if (f) { f.value = ''; f.click(); } }
async function lqUpOnFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const box = document.getElementById('lqUpPanel');
  if (box) box.innerHTML = '<p class="slv-muted">Reading the file…</p>';
  try {
    const grid = await lrfGrid(file);
    const hi = grid.findIndex(r => (r || []).some(c => /^client key/i.test(String(c || '').trim())));
    if (hi < 0) throw new Error('no key column');
    const H = grid[hi].map(c => String(c || '').trim().toLowerCase());
    const ci = { key: H.findIndex(h => h.startsWith('client key')), sent: H.findIndex(h => h.startsWith('sent')), out: H.findIndex(h => h.startsWith('take out')), note: H.findIndex(h => h === 'note'), name: H.indexOf('client') };
    const byKey = new Map(lqRows.map(r => [r.client_key, r]));
    const canon = new Map(LL_REASONS.map(x => [x.toLowerCase(), x]));
    const yes = v => /^(y|yes|sent|x|1|true)$/i.test(String(v || '').trim());
    const mark = [], out = [], unknown = [], gone = [];
    let seen = 0;
    grid.slice(hi + 1).forEach(r => {
      const key = String((r || [])[ci.key] || '').trim();
      if (!key) return;
      seen++;
      const row = byKey.get(key), name = String((ci.name >= 0 && r[ci.name]) || (row && row.client_name) || key).trim();
      if (!row) { gone.push(name); return; }
      const raw = ci.out >= 0 ? String(r[ci.out] || '').trim() : '';
      if (raw) {
        const reason = canon.get(raw.toLowerCase());
        if (!reason) unknown.push({ name, raw }); else out.push({ row, name, k: key, r: reason, n: ci.note >= 0 ? String(r[ci.note] || '').trim().slice(0, 200) : '' });
        return;   // taken out wins over Sent?
      }
      if (ci.sent >= 0 && yes(r[ci.sent]) && !row.messaged) mark.push({ row, name });
    });
    lqUpPlan = { mark, out };
    const names = (l, n = 12) => l.slice(0, n).map(x => lcEsc(x.name)).join(', ') + (l.length > n ? `, and ${lcNum(l.length - n)} more` : '');
    const total = mark.length + out.length;
    box.innerHTML = `<div class="lrf-box"><div><b>${lcEsc(file.name)}</b>: ${lcNum(seen)} rows read.</div><ul class="lrf-list">
      <li><b>${lcNum(mark.length)}</b> marked as sent${mark.length ? ': ' + names(mark) : ''}</li>
      <li><b>${lcNum(out.length)}</b> taken out of the blast${out.length ? ': ' + names(out) : ''}</li>
      ${unknown.length ? `<li class="lrf-warn"><b>${lcNum(unknown.length)}</b> have a reason that is not on the list, so they are left as they are: ${unknown.slice(0, 8).map(x => lcEsc(x.name) + ' ("' + lcEsc(x.raw) + '")').join(', ')}</li>` : ''}
      ${gone.length ? `<li class="lrf-warn"><b>${lcNum(gone.length)}</b> are no longer on this list (messaged, booked, or taken out already), so they are skipped</li>` : ''}</ul>
      <div class="lrf-act"><button type="button" class="tglr lc-btn" onclick="lqUpApply()"${total ? '' : ' disabled'}>${total ? 'Apply ' + lcNum(total) + ' change' + (total === 1 ? '' : 's') : 'Nothing to change'}</button>
      <button type="button" class="tglr lc-btn" onclick="lqUpCancel()">Cancel</button></div></div>`;
  } catch (e) {
    console.error(e); lqUpPlan = null;
    if (box) box.innerHTML = '<p class="slv-note">That file could not be read. Use a file downloaded from this page (XLSX or CSV), with its Client key column.</p>';
  }
}
function lqUpCancel() { lqUpPlan = null; const b = document.getElementById('lqUpPanel'); if (b) b.innerHTML = ''; }
async function lqUpApply() {
  if (!lqUpPlan) return;
  const { mark, out } = lqUpPlan, box = document.getElementById('lqUpPanel');
  if (mark.length + out.length > 300 && !confirm(`Apply ${mark.length + out.length} changes at once?`)) return;
  if (box) box.innerHTML = '<p class="slv-muted">Saving…</p>';
  let err = null;
  if (mark.length) { const r = await sb.rpc('lost_queue_mark', { p_keys: mark.flatMap(x => [x.row.client_key].concat(x.row._dupKeys)) }); err = err || r.error; }
  if (out.length) { const r = await sb.rpc('lost_exclude_bulk', { p_items: out.map(x => ({ k: x.k, r: x.r, n: x.n || null })), p_clear: [] }); err = err || r.error; }
  lqUpPlan = null;
  if (err) { console.error(err); if (box) box.innerHTML = '<p class="slv-note">Part of that did not save. Reload the list to see what did, then upload again.</p>'; await lqRenderQueue(true); return; }
  await lqRenderQueue(true);
  const b2 = document.getElementById('lqUpPanel');
  if (b2) b2.innerHTML = `<p class="slv-note">Saved: ${lcNum(mark.length)} marked as sent, ${lcNum(out.length)} taken out.</p>`;
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
function lqTplType(key) { return key.replace(/^(wa|sms)_/, ''); }
// Real clients the preview can use: the first few on the list that get this template.
function lqSamples(key) {
  const t = lqTplType(key), ch = key.startsWith('sms') ? 'sms' : 'whatsapp';
  const ok = r => (r._ch === ch) && r.qtype === t;
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
          ? 'A text is one message up to 160 characters, so keep it short. The approved wording has no opt-out line. Where texts are sent from (and the sender name) is set up outside this page.'
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
