// Lost Clients, To message and Templates tabs (Kate, 9 Oct 2026). The five groups overlap (group 4 is everyone), so this is the
// one running list built from them: every client who can be messaged, ONE message each, first match wins:
// group 3 -> colour (with the welcome-back rate offer, no end date, Kate 13 Oct), then groups 1 or 2 -> smoothing, group 5 -> other services, group 4 only -> everyone else.
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
  wa_smoothing: "Hi {first_name}, it's Tara Rose {branch}. You've been on our minds.\n\nYour last smoothing[ with {stylist}] was back in {month}, and smoothing softens over time. We'd love to see how your hair is feeling now, and we'll tell you honestly what it needs, even if the answer is \"not yet\".\n\nBecause we've missed you, your next smoothing is 30% off.\n\nShall we find you a time? 🤍",
  wa_colour: "Hi {first_name}, it's Tara Rose {branch}. You've been on our minds.\n\nYour last colour was in {month}, and a lot can change in a few months. Hair grows, tones soften, and sometimes you just fancy something different.\n\nWe'd also like to introduce you to our new stylists. We'll start by looking at your hair together and build a plan around you.\n\nAs a welcome back, your next colour is 20% off.\n\nShall we find you a time? 🤍",
  wa_due: "Hi {first_name}, it's Tara Rose {branch}. We've missed you.\n\nIt's been a little while since we saw you[ with {stylist}]. Tell us what's been on your mind, whether that's a fresh cut, a colour refresh or a catch-up, and we'll find a time that suits you.\n\nWe'd love to have you back in the chair. 🤍",
  sms_smoothing: "Hi {first_name}, it's Tara Rose {branch}. We've missed you. Your last smoothing[ with {stylist}] was back in {month}, and you can have 30% off your next one. We'll look at your hair first and tell you honestly what it needs. Shall we find you a time?",
  sms_colour: "Hi {first_name}, it's Tara Rose {branch}. We've been thinking of you. Your last colour was in {month}, and you can have 20% off your next one, plus a chance to meet our new stylists. Shall we find you a time?",
  sms_due: "Hi {first_name}, it's Tara Rose {branch}. We've missed you. It's been a little while and we think you're due a visit[ with {stylist}]. Tell us what you'd like to do with your hair and we'll find the right time.",
};
const LQ_TOKENS = ['{first_name}', '{branch}', '{stylist}', '{month}'];

let lqSel = { tab: 'groups', view: 'send', area: 'wa', wv: 0, smsCap: 100, ch: 'all', ty: 'all', br: 'all', st: 'all', sty: 'all', ph: 'all', sort: 'best', per: 20, batch: 50 };
try { Object.assign(lqSel, JSON.parse(localStorage.getItem('trs-lost-queue') || '{}')); } catch (e) {}
const lqSave = () => { try { localStorage.setItem('trs-lost-queue', JSON.stringify(lqSel)); } catch (e) {} };
let lqOptSet = new Set();   // digits of the numbers on lost_send_optout, from lost_send_info
const lqOptedOut = r => lqOptSet.size > 0 && lqOptSet.has(String(r._phone || '').replace(/\D/g, ''));
let lqSnd = { info: null, jobs: {}, poll: null, test: null };   // sending from the site (migrations/lost_send.sql), see SENDING FROM THE SITE below
let lqData = null, lqRows = [], lqTpl = null, lqLoadedAt = 0, lqQuery = '', lqPage = 1, lqShown = [], lqBusy = false, lqErr = '', lqTplKey = 'wa_smoothing', lqTplSample = 0;
const lqToday = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD on this computer's clock

// ── TABS (drawn by renderLostListsPage in lost-lists.js) ─────────────────────────────────────
// Kate, 22 Oct 2026: Level 4 (Accounts and Admin) sees every campaign's performance, so here the Performance report and Terms and conditions only:
// no lists, no To message, no Templates, no phone numbers.
const lqAcct = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL === 4;
const lqDefaultTab = () => lqAcct() ? 'perf' : 'groups';
function lqAllowed() { return typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3 && !lqAcct(); }
// Kate, 19 Oct 2026: the Performance report opens to Level 2 (the coordinators), who see the rail with just The five groups and Performance report.
// To message and Templates show phone numbers and stay Level 3 and above.
// Kate, 22 Oct 2026: Terms and conditions is Level 2 as well ("nawala t&c sa view nila"): it is the welcome-back rate PDF, no names or numbers, and the
// coordinators are the ones who tell a client what the rate's terms are.
const lqTabOk = t => lqAllowed() || (lqAcct() && (t === 'perf' || t === 'terms')) || (typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2 && !lqAcct() && (t === 'groups' || t === 'perf' || t === 'terms'));
// Kate, 16 Oct 2026: the tabs became the "On this page" rail the Organisation Pulse has (same .side-nav markup, in the gutter above 1100px and a
// row of chips below it), with a fourth entry, Performance report. A rail entry opens a tab instead of scrolling, so spy() in index.html leaves
// this rail alone (data-tabs) and lqShowTab lights the entry. Level 3 and above; Level 2 sees the groups, the Performance report and Terms and conditions (lqTabOk).
const LQ_TABS = [['groups', 'The five groups'], ['queue', 'To message'], ['tpl', 'Templates'], ['perf', 'Performance report'], ['terms', 'Terms and conditions']];
function lqRailHtml() {
  if (!lqTabOk('groups') && !lqTabOk('perf')) return '';
  return `<aside class="lg-side"><nav class="side-nav" data-tabs="1" aria-label="On this page"><div class="side-k">On this page</div>${LQ_TABS
    .filter(([k]) => lqTabOk(k)).map(([k, l]) => `<a href="#lost-${k}" data-t="${k}" class="${lqSel.tab === k ? 'on' : ''}" onclick="event.preventDefault();lqShowTab('${k}')">${l}</a>`).join('')}</nav></aside>`;
}
function lqShowTab(t) {
  if (!lqTabOk(t)) t = lqDefaultTab();
  lqSel.tab = t; lqSave();
  if (typeof trSyncUrl === 'function') trSyncUrl(null);   // the address names the tab: ?view=lost-clients&tab=templates
  document.querySelectorAll('#lostListsContent .side-nav a[data-t]').forEach(a => a.classList.toggle('on', a.dataset.t === t));
  const g = document.getElementById('llHost'), q = document.getElementById('lqHost');
  if (g) g.hidden = t !== 'groups';
  if (q) q.hidden = t === 'groups';
  if (t !== 'perf' && typeof lrRailClear === 'function') lrRailClear();   // the Performance report's sub-entries only live on its own tab
  if (t === 'queue') lqRenderQueue(); else if (t === 'tpl') lqRenderTpl(); else if (t === 'perf' && typeof lrRenderPerf === 'function') lrRenderPerf(); else if (t === 'terms') lqRenderTerms();
}
// Terms and conditions (Kate, 16 Oct 2026): the welcome-back rate terms PDF, fifth rail entry, shown inline with an Open link for a bigger view.
const LQ_TERMS_PDF = 'assets/lost-clients-welcome-back-terms.pdf';
function lqRenderTerms() {
  const host = document.getElementById('lqHost');
  if (!host || lqSel.tab !== 'terms') return;
  host.innerHTML = `<div class="lr-sec"><h3>Welcome-back rate: Terms &amp; Conditions</h3>
    <p class="slv-muted">The terms that go with the welcome-back rate in the Lost Clients message. Tell a client who asks, or open the PDF to read it with her.</p>
    <p><a class="lq-terms-open" href="${LQ_TERMS_PDF}" target="_blank" rel="noopener">Open the PDF in a new tab</a></p>
    <iframe class="lq-terms-frame" src="${LQ_TERMS_PDF}#view=FitH" title="Welcome-back rate Terms and Conditions"></iframe></div>`;
}
// Called once renderLostListsPage has drawn the page: open the tab the person left on.
// The address bar names the tab (Kate, 12 Oct 2026): ?view=lost-clients&tab=templates. Slugs: groups, to-message, templates.
const LQ_SLUG = { groups: 'groups', queue: 'to-message', tpl: 'templates', perf: 'performance', terms: 'terms-and-conditions' };
function lqUrlParts() { return lqTabOk(lqSel.tab) && LQ_SLUG[lqSel.tab] ? ['tab=' + LQ_SLUG[lqSel.tab]] : []; }
function lqTabFromUrl() {
  try { const s = new URLSearchParams(location.search).get('tab'); return Object.keys(LQ_SLUG).find(k => LQ_SLUG[k] === s) || ''; } catch (e) { return ''; }
}
function lqAfterRender() {
  // A link that names its tab wins over the one she left on; a bare link opens the remembered one.
  const want = lqTabFromUrl() || lqSel.tab, t = lqTabOk(want) ? want : lqDefaultTab();
  lqShowTab(t && LQ_SLUG[t] ? t : lqDefaultTab());
}

// ── DATA ─────────────────────────────────────────────────────────────────────────────────────
async function lqLoad(force) {
  if (lqData && !force && Date.now() - lqLoadedAt < 5 * 60e3) return;
  const [q, t] = await Promise.all([sb.rpc('lost_queue'), lqTpl && !force ? { data: lqTpl } : sb.rpc('lost_templates_get')]);
  if (q.error || !q.data || !Array.isArray(q.data.rows)) throw q.error || new Error('no queue');
  if (t.error || !Array.isArray(t.data)) throw t.error || new Error('no templates');
  lqData = q.data; lqTpl = t.data; lqLoadedAt = Date.now();
  await lqSendLoad();   // never throws: without it the page works as before (Open in WhatsApp, Mark sent)
  if (typeof lqwLoad === 'function') await lqwLoad();   // the waves (lost-waves.js); never throws, without them the page is the single list
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
    r.also_on = [...new Set((r.also_on || []).map(x => x === '1' ? '2' : x))];   // groups 1 and 2 are one group now
    r._phone = r.n_numbers === 1 && r.mobile ? String(r.mobile).split(' / ')[0] : '';
    r._dup = false; r._dupKeys = []; r._dupNames = [];
    r._job = lqSnd.jobs[r.client_key] || null;
  });
  // One phone, one message: two clients on the same number (a mother and daughter) get the message once.
  rows.slice().sort((a, b) => (a.days_since - b.days_since)).forEach(r => {
    if (!r._phone) return;
    const first = seenPhone[r._phone];
    if (first) { r._dup = true; first._dupKeys.push(r.client_key); first._dupNames.push(r.client_name); }
    else seenPhone[r._phone] = r;
  });
  // Clients on the send opt-out list (lost_send_optout: replied STOP or not interested to an earlier blast, or reception said do not contact) are never sent to,
  // even when she has visited since. They are left off this list so a wave does not show them as "ready" and then refuse them (16 Oct 2026: 22 in Wave 2).
  lqRows = rows.filter(r => !r._dup && !lqOptedOut(r));
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
// A message waiting to go, going, failed or skipped sits in its own view (Sending) until it is sent; a cancelled one is back in To send.
const LQ_OUT = ['queued', 'sending', 'failed', 'skipped'];
function lqView(r) { return lqIsReplied(r) ? 'reply' : r.messaged ? 'sent' : (r._job && LQ_OUT.includes(r._job.status)) ? 'out' : 'send'; }
function lqBase() { return lqRows.filter(r => lqView(r) === lqSel.view && (typeof lqwOn !== 'function' || !lqwOn() || r._ch === lqSel.ch)); }
function lqFiltered(view) {
  const q = lqQuery.trim().toLowerCase();
  let out = lqRows.filter(r => lqView(r) === (view || lqSel.view)
    && (lqSel.ch === 'all' || r._ch === lqSel.ch) && (typeof lqwOn !== 'function' || !lqwOn() || lqwKeep(r, view || lqSel.view)) && (lqSel.ty === 'all' || r.qtype === lqSel.ty) && (lqSel.br === 'all' || r.branch === lqSel.br)
    && (lqSel.st === 'all' || r.wa === lqSel.st)
    && (typeof lqwArmKeep !== 'function' || lqwArmKeep(r, view || lqSel.view))
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
  if (typeof lqwOn === 'function' && lqwOn()) return lqwPaint(host);   // WhatsApp and Text areas, the waves (lost-waves.js)
  const n = v => lqRows.filter(r => lqView(r) === v).length;
  const sk = (lqData && lqData.skipped) || {}, held = (lqData && lqData.held) || 0;
  const recentN = (lqData && lqData.recent) || 0, taken = (lqData && lqData.excluded) || 0, reviewed = Object.keys((lqData && lqData.review) || {}).length;
  const today = lqToday(), doneToday = lqRows.filter(r => r.messaged && String(r.sent_on || '').slice(0, 10) === today).length;
  const pct = Math.min(100, Math.round(100 * doneToday / lqSel.batch));
  const stat = (v, t, d) => `<button type="button" class="ll-card lq-stat${lqSel.view === v ? ' on' : ''}" onclick="lqSet('view','${v}')"><div class="ll-t">${t}</div><div class="ll-n">${lcNum(n(v))}</div><div class="ll-d">${d}</div></button>`;
  const brs = [...new Set(lqRows.map(r => r.branch))].sort();
  const chN = c => lqRows.filter(r => lqView(r) === lqSel.view && (c === 'all' || r._ch === c)).length;
  host.innerHTML = `
    <div class="ll-fresh">
      <span class="ll-chip">Sent is read from <b>respond.io</b> every night</span>
      <span class="ll-chip">Campaign started <b>${lcEsc(llDay(LL_CAMPAIGN_STARTED))}</b></span>
      <span class="ll-chip${reviewed < 4 ? ' warn' : ' ok'}" title="Coordinators mark their branch reviewed on the Lost Clients groups tab">Branches reviewed <b>${reviewed} of 4</b></span>
      <button type="button" class="ll-chip lq-refresh" onclick="lqRenderQueue(true)" title="Fetch the list again">Refresh</button>
    </div>
    <div class="ll-cards lq-stats">
      ${stat('send', 'To send', 'one message each, best first')}
      ${lqSnd.info && (lqSnd.info.enabled || n('out')) ? stat('out', 'Sending', lqOutLine()) : ''}
      ${stat('sent', 'Sent', 'waiting for a reply')}
      ${stat('reply', 'Replied', 'someone needs to answer')}
      <div class="ll-card lq-held" title="Booked clients, clients who came in within the last 6 weeks, and clients the coordinators took out are kept off To message"><div class="ll-t">Left out</div><div class="ll-n">${lcNum(held + recentN + taken + (sk.nonum || 0) + (sk.blocked || 0) + (sk.optout || 0) + (sk.unchecked || 0) + (sk.check || 0))}</div>
        <div class="ll-d">${lcNum(held)} booked · ${lcNum(recentN)} came in lately · ${lcNum(taken)} taken out · ${lcNum(sk.nonum || 0)} no number${sk.blocked ? ` · ${lcNum(sk.blocked)} blocked` : ''}${sk.optout ? ` · ${lcNum(sk.optout)} opted out` : ''}${sk.unchecked ? ` · ${lcNum(sk.unchecked)} not checked yet` : ''}${sk.check ? ` · ${lcNum(sk.check)} check numbers` : ''}</div></div>
    </div>
    <section class="slv-card ll-panel">
      <div class="lq-batch"><div><b>Today's batch</b><div class="slv-note">Best first: WhatsApp active, smoothing, then colour.</div></div>
        <div class="lq-prog" role="img" aria-label="${doneToday} of ${lqSel.batch} sent today"><i style="width:${pct}%"></i></div>
        <div><b>${lcNum(doneToday)}</b> of <select class="ll-sel" onchange="lqSet('batch',+this.value)">${[25, 50, 100, 200].map(v => `<option${v === lqSel.batch ? ' selected' : ''}>${v}</option>`).join('')}</select> sent today</div></div>
      ${lqSendBarHtml()}
      <div class="lc-tools ll-tools lq-tools">
        <div class="sc-seg" role="group" aria-label="Channel">${[['all', 'All'], ['whatsapp', 'WhatsApp'], ['sms', 'Text']].map(([k, l]) => `<button type="button" class="${lqSel.ch === k ? 'on' : ''}" onclick="lqSet('ch','${k}')">${l} ${lcNum(chN(k))}</button>`).join('')}</div>
        <select class="ll-sel" aria-label="Message" onchange="lqSet('ty',this.value)"><option value="all">All messages</option>${LQ_TYPE_ORDER.map(k => `<option value="${k}"${lqSel.ty === k ? ' selected' : ''}>${lcEsc(LQ_TYPES[k][0])}</option>`).join('')}</select>
        ${typeof lqwArmSelect === 'function' ? lqwArmSelect() : ''}
        <select class="ll-sel" aria-label="Branch" onchange="lqSet('br',this.value)"><option value="all">All branches</option>${brs.map(b => `<option value="${b}"${lqSel.br === b ? ' selected' : ''}>${lcEsc(LC_BRANCH[b] || b)}</option>`).join('')}</select>
        <select class="ll-sel" aria-label="Order" onchange="lqSet('sort',this.value)">${[['best', 'Best first'], ['oldest', 'Lost longest first'], ['name', 'Name A to Z']].map(([k, l]) => `<option value="${k}"${lqSel.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input type="search" class="ll-search" id="lqSearch" placeholder="Search name or stylist" value="${lcEsc(lqQuery)}" oninput="lqQuery=this.value;lqPage=1;lqPaintTable()">
        <span style="flex:1"></span>
        <span class="lq-btns">
          <button type="button" class="tglr lc-btn" onclick="lqSaveFile('xlsx')" title="Download what is shown, with the message for each">XLSX</button>
          <button type="button" class="tglr lc-btn" onclick="lqSaveFile('csv')" title="Download what is shown, with the message for each">CSV</button>
        </span>
        <span id="lqNote" class="slv-note" style="display:inline"></span>
      </div>
      <p id="lqCount" class="slv-note"></p>
      <div id="lqTable"></div>
      <p class="slv-muted ll-foot">One message per client, first match wins: smoothing, then colour, then other services, then everyone else. Someone in several groups appears once. This page and its phone numbers are for Level 4 and above.
      Sent comes from respond.io (it only sees messages sent through it); a text, or WhatsApp opened from here, is marked by the button. A client with a booking, or who came in within the last 6 weeks, leaves the list on her own. Two clients on one number get one message.</p>
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
  const msgCell = (r, i) => { const m = lqShownText(r); return `<div class="lq-msg" title="${lcEsc(m)}">${lcEsc(m)}</div>${r._ch === 'sms' ? `<div class="slv-note${m.length > 160 ? ' lq-long' : ''}">${m.length} characters${m.length > 160 ? ', more than one text' : ''}</div>` : ''}`; };
  const act = (r, i) => {
    if (view === 'out') return lqOutAct(r, i);
    if (view === 'send' && typeof lqwOn === 'function' && lqwOn() && r._ch === 'whatsapp' && !lqwCanWave(r)) return `<span class="slv-note">${typeof lqwHeld === 'function' && lqwHeld(r) ? 'Held back for now' : 'Its wave is not open'}</span>`;
    if (view === 'send') {
      const site = lqCanSend(r) ? `<button type="button" class="tglr lc-btn lq-pri" onclick="lqSendRows([${i}])" title="Send it now through respond.io, from ${lcEsc(LQ_SHORT[r.branch] || r.branch)}'s number">Send</button>` : '';
      const wa = r._ch === 'whatsapp' && r._phone
        ? `<button type="button" class="tglr lc-btn${site ? '' : ' lq-pri'}" onclick="lqOpen(${i})">Open in WhatsApp</button><button type="button" class="tglr lc-btn" onclick="lqCopy(${i})">Copy message</button>`
        : `<button type="button" class="tglr lc-btn lq-pri" onclick="lqCopy(${i})">${r._ch === 'sms' ? 'Copy text' : 'Copy message'}</button>`;
      return `<div class="lq-acts">${site}${wa}<button type="button" class="tglr lc-btn" onclick="lqMarkOne(${i})" title="I sent this one">Mark sent</button></div>`;
    }
    const by = r.sent_by === 'respond.io' ? 'via respond.io' : /^site:/.test(r.sent_by || '') ? `sent here by ${lcEsc(r.sent_by.slice(5))}` : `marked by ${lcEsc(r.sent_by || 'someone')}`;
    const when = `Sent ${lcEsc(llDayS(r.sent_on))} <span class="slv-note">${by}</span>`;
    if (view === 'reply') return `<div class="lq-rep">Replied ${lcEsc(llDayS(r.last_in))}</div><div class="slv-note">${when}. Answer in respond.io.</div>`;
    return `<div class="lq-sent">${when}</div>${r.by_mark ? `<button type="button" class="tglr lc-btn" onclick="lqUnmark(${i})">Undo</button>` : ''}`;
  };
  const tr = shown.map((r, i) => `<tr>
      <td>${lcEsc(r.client_name)}${two(r)}${flags(r)}<div class="slv-note">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(r.area)}</div></td>
      <td><span class="ll-tag lq-type">${lcEsc(LQ_TYPES[r.qtype][0])}</span>${typeof lqwArmTag === 'function' ? lqwArmTag(r) : ''}<div class="slv-note">${lcEsc(LQ_TYPES[r.qtype][1])}${(r.also_on || []).length > 1 ? ` · in ${r.also_on.length} groups` : ''}</div></td>
      <td>${chan(r)}<div class="lq-st">${llStatus(r)}</div></td>
      <td class="ll-team">${lcTeam(r).hair[0] ? lcStylist(lcTeam(r).hair[0]) : '<span class="slv-muted">none</span>'}${lcTeam(r).hair[0] && !r._sty ? '<div class="slv-note" title="Left, or no Staff Card, so the message does not name her">not named</div>' : ''}</td>
      <td class="ll-ph">${lcPhone(r)}</td>
      <td class="lq-msgtd">${msgCell(r, i)}</td>
      ${view === 'out' ? `<td class="ll-nw">${lqOutAt(r, i)}</td>` : ''}<td class="lq-acttd">${act(r, i)}</td></tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${two(r)}</span><span>${chan(r)}</span></div>
      <div class="prd-meta">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(LQ_TYPES[r.qtype][0])} · ${llStatus(r)}</div>
      <div class="prd-meta" style="margin-top:4px">${lcPhone(r)}${r._sty ? ' · ' + lcEsc(r._sty) : ''}</div>
      <div class="lq-msg lq-msg-m">${lcEsc(lqShownText(r))}</div>
      ${view === 'out' && r._job && r._job.status === 'queued' ? `<div style="margin-top:6px">${lqOutAt(r, i)}</div>` : ''}<div style="margin-top:8px">${act(r, i)}</div></div></li>`).join('');
  const from = (lqPage - 1) * per + 1;
  const th = (label, k, marked) => `<th><button type="button" class="ll-thb${marked ? ' on' : ''}" onclick="llMenu(event,'${k}')" aria-haspopup="dialog" title="Filter or sort">${lcEsc(label)} <span aria-hidden="true">▾</span></button></th>`;
  const heads = th('Client', 'q-client', lqSel.br !== 'all' || lqSel.sort !== 'best') + th('Message', 'q-message', lqSel.ty !== 'all')
    + (typeof lqwOn === 'function' && lqwOn() ? '<th>Channel</th>' : th('Channel', 'q-channel', lqSel.ch !== 'all' || lqSel.st !== 'all')) + th('Usual stylist', 'q-stylist', lqSel.sty !== 'all')
    + th('Phone', 'q-phone', lqSel.ph !== 'all') + '<th>What she gets</th>' + (view === 'out' ? '<th>Send at</th>' : '') + '<th></th>';
  box.innerHTML = `${view === 'out' ? lqTriageHtml() : ''}<div class="slv-wrap prd-desk lc-wrap ll-wrap"><table class="slv-table"><thead><tr>${heads}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${view === 'out' ? 8 : 7}" class="slv-muted">${view === 'send' ? 'Nobody left to send to with these filters.' : view === 'out' ? 'Nothing queued, failed or skipped.' : 'Nobody here yet.'}</td></tr>`}</tbody></table></div>
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
  window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(lqShownText(r)), '_blank', 'noopener');
}
async function lqCopy(i) {
  const r = lqShown[i];
  if (!r) return;
  try { await navigator.clipboard.writeText(lqShownText(r)); } catch (e) { lqNote('The browser would not copy. Use the file instead.'); return; }
  lqNote(`Copied the message for ${r.client_name}`);
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
  // The name says what is in it (Kate, 12 Oct 2026: she downloaded Al Quoz and the file did not say so).
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = ['lost-clients-to-message', { send: 'to-send', out: 'sending', sent: 'sent', reply: 'replied' }[lqSel.view] || lqSel.view,
    lqSel.br !== 'all' ? slug(LC_BRANCH[lqSel.br] || lqSel.br) : '', lqSel.ch !== 'all' ? (lqSel.ch === 'sms' ? 'text' : 'whatsapp') : '',
    lqSel.ty !== 'all' ? slug(LQ_TYPES[lqSel.ty][0]) : '', lqSel.st !== 'all' ? slug((LL_ST[lqSel.st] || [])[1] || lqSel.st) : '',
    lqSel.sty !== 'all' ? (lqSel.sty === 'named' ? 'stylist-named' : 'no-stylist') : '', lqSel.ph !== 'all' ? 'one-number' : '',
    lqQuery.trim() ? 'search' : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
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
          : 'WhatsApp only lets us start a chat with someone who has not written in the last 24 hours using a message Meta has approved, so a changed wording has to be approved in respond.io before it is sent there. Added automatically: for "Replied 12 to 18 months ago" the opening becomes "it\'s been a while since we last chatted, this is ...", and for "No reply seen" the message ends with "' + lcEsc(LQ_STOP.trim()) + '"' + (lqSendOn() ? '. <b>Sending from this site uses the approved Meta wording, so editing it here does not change what goes out through Send.</b>' : '')}</p>
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

// ── SENDING FROM THE SITE (Kate, 12 Oct 2026) ────────────────────────────────────────────────
// Phase 1, WhatsApp only: the page queues messages (lost_send_enqueue), the lost-send-worker edge function sends each through respond.io from the
// client's own branch number using a Meta-approved template, then tags the contact in respond.io. See migrations/lost_send.sql.
// Everything here is switched on by lost_send_config.enabled (Level 5 flips it from the bar below, or in the database). Off, or if the tables are
// not there, the page behaves exactly as before: Open in WhatsApp, Copy message, Mark sent.
async function lqSendLoad() {
  try {
    const [i, j] = await Promise.all([sb.rpc('lost_send_info'), sb.rpc('lost_send_jobs_get')]);
    if (i.error || !i.data || j.error || !Array.isArray(j.data)) throw i.error || j.error || new Error('no send info');
    lqSnd.info = i.data;
    lqOptSet = new Set(i.data.optouts || []);
    lqSnd.skew = i.data.server_now ? Date.parse(i.data.server_now) - Date.now() : 0;
    lqSnd.jobs = {};
    j.data.forEach(x => { lqSnd.jobs[x.client_key] = x; });
  } catch (e) { lqSnd.info = null; lqSnd.jobs = {}; }
}
function lqRelink() { lqRows.forEach(r => { r._job = lqSnd.jobs[r.client_key] || null; }); }
const lqSendOn = () => !!(lqSnd.info && lqSnd.info.enabled);
// Clients who wrote to us in the last 12 months (waves 1 and 2) get the wording with no end date (15 Oct 2026, the v2 templates); the pilot is half and
// half: 1a the standard v2 message, 1b the story message (lost-waves.js, lqwArm).
// Waves 3 and 4 (15 Oct 2026): the same wording plus the STOP line (the _v2_stop templates); Wave 4, the coldest group, is the Due message only, no offer.
function lqTkeyBase(r) { return r.wa === 'act' ? r.qtype + '_v2' : r.wa === 'r18' ? r.qtype + '_v2_stop' : r.wa === 'noreply' ? 'due_v2_stop' : r.qtype; }
function lqTkey(r) { return r.wa === 'act' && typeof lqwArm === 'function' && lqwArm(r) === 'b' ? r.qtype + '_story' : lqTkeyBase(r); }
const lqSendTpl = r => lqSnd.info && (lqSnd.info.templates || []).find(t => t.key === lqTkey(r));
// The values for {{1}}, {{2}}... in the template's order; a client with no usual stylist reads "our team".
function lqSendVars(r) { const v = lqVars(r); v.stylist = v.stylist || 'our team'; return v; }
function lqSendParams(t, r) {
  const v = lqSendVars(r), i = lqSnd.info;
  return t.vars.map(k => k === 'offer_pct' ? (t.qtype === 'colour' ? i.offer_colour : i.offer_smoothing) : k === 'offer_until' ? i.offer_until : String(v[k] || '').trim());
}
function lqSendText(r) {
  const t = lqSendTpl(r);
  if (!t) return '';
  const p = lqSendParams(t, r);
  return t.body.replace(/\{\{(\d+)\}\}/g, (m, n) => p[n - 1] != null ? p[n - 1] : m);
}
// What a WhatsApp client is told. With sending on and the template approved it is the approved wording (what respond.io sends, and what Open in
// WhatsApp opens); otherwise the Templates tab wording, as before.
function lqShownText(r) {
  if (r._ch === 'whatsapp' && lqSendOn()) { const t = lqSendTpl(r); if (t && t.approved && lqSendParams(t, r).every(Boolean)) return lqSendText(r); }
  return lqMessage(r);
}
function lqCanSend(r) {
  if (typeof lqwOn === 'function' && lqwOn() && r._ch === 'whatsapp' && !lqwCanWave(r)) return false;   // its wave is not open (lost-waves.js)
  if (!lqSendOn() || r._ch !== 'whatsapp' || !r._phone || (r._job && r._job.status !== 'cancelled') || r.messaged) return false;
  const t = lqSendTpl(r);
  return !!(t && t.approved && lqSendParams(t, r).every(Boolean));
}
const lqRoom = () => typeof lqwOn === 'function' && lqwOn() ? lqwRoom() : lqSnd.info ? Math.max(0, lqSnd.info.daily_cap - lqSnd.info.used_today) : 0;
const lqHour = h => String(h).padStart(2, '0') + ':00';
function lqOutLine() {
  const c = s => Object.values(lqSnd.jobs).filter(j => j.status === s).length;
  const bits = [[c('queued') + c('sending'), 'waiting'], [c('failed'), 'failed'], [c('skipped'), 'skipped']].filter(b => b[0]).map(b => `${lcNum(b[0])} ${b[1]}`);
  return bits.length ? bits.join(' · ') : 'queued, failed and skipped';
}

function lqSendBarHtml() {
  const i = lqSnd.info;
  if (!i) return '';
  const lvl5 = typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 5;
  const kill = lvl5 ? `<button type="button" class="tglr lc-btn" onclick="lqSendToggle()" title="The kill switch. Off stops everything that has not gone yet.">${i.enabled ? 'Switch sending off' : 'Switch sending on'}</button>` : '';
  const test = i.test_ready && lvl5 ? `<span class="lq-testbox"><select class="ll-sel" id="lqTestTpl" aria-label="Template to test">${(i.templates || []).filter(t => t.approved).map(t => `<option value="${t.key}">${lcEsc(t.respond_name)}</option>`).join('') || '<option value="">No approved template yet</option>'}</select>
      <button type="button" class="tglr lc-btn" onclick="lqSendTest()">Send a test to my number</button></span>` : '';
  if (!i.enabled) {
    if (!lvl5) return '';
    return `<div class="lq-sendbar off"><div><b>Sending from here is off</b><div class="slv-note">${lvl5 ? 'Switch it on when the templates are approved and a test has gone through.' : 'Kate switches it on once the templates are approved.'} Open in WhatsApp and Mark sent still work.</div></div>
      <span style="flex:1"></span>${test}${kill}</div>`;
  }
  const rows = lqSendable();
  const waiting = lqFiltered('send').filter(r => r._ch === 'whatsapp' && r._phone && !r._job && !lqCanSend(r)).length;
  const inWin = i.dubai_hour >= i.hour_from && i.dubai_hour < i.hour_to;
  return `<div class="lq-sendbar"><div><b>Send through respond.io</b>
      <div class="slv-note">${lcNum(rows.length)} ready in this view${waiting ? ` · ${lcNum(waiting)} waiting on a template Meta has not approved yet, or a missing name or date` : ''}.
        Today ${lcNum(i.used_today)} of ${lcNum(i.daily_cap)} queued or sent. Goes out ${i.slot_cap ? `${lcNum(i.slot_cap)} every ${lcNum(i.slot_minutes)} minutes` : `${lcNum(i.per_run)} a minute`}, ${lcEsc(lqHour(i.hour_from))} to ${lcEsc(lqHour(i.hour_to))} Dubai time${inWin ? '' : ', so it waits until then'}.</div></div>
      <span style="flex:1"></span>${test}
      <button type="button" class="tglr lc-btn lq-pri" onclick="lqSendReview()"${rows.length && lqRoom() ? '' : ' disabled'}>Review and send ${lcNum(Math.min(rows.length, lqRoom()))}…</button>${kill}</div>`;
}
// The rows a bulk send would take: what the filters show in To send, in the order shown, up to what the daily cap has left.
function lqSendable() { return lqFiltered('send').filter(lqCanSend); }

function lqModalOpen(html) {
  lqModalClose();
  const d = document.createElement('div');
  d.className = 'lqm-back'; d.id = 'lqModal';
  d.innerHTML = `<div class="lqm slv-card" role="dialog" aria-modal="true">${html}</div>`;
  d.addEventListener('click', e => { if (e.target === d) lqModalClose(); });
  document.body.appendChild(d);
  document.addEventListener('keydown', lqModalKey);
}
function lqModalKey(e) { if (e.key === 'Escape') lqModalClose(); }
function lqModalClose() { const d = document.getElementById('lqModal'); if (d) d.remove(); document.removeEventListener('keydown', lqModalKey); }

let lqPending = [];
// The review dialog (16 Oct 2026): what goes, plus WHEN: as soon as the window allows or at a set time, how many, and a pace ("B at a time every M
// minutes"). send-schedule.js draws the When form and the database spreads the run times (migrations/send_schedule*.sql). roomNow is how many may
// still go today (the wave's share of the daily cap); a later day gets a fresh day's cap, so a batch can be scheduled even when today's is used up.
function lqSendReview() {
  const rows = lqSendable();
  if (rows.length) lqSendRowsReview(rows, lqRoom());
}
function lqSendRows(idx) {
  const rows = idx.map(i => lqShown[i]).filter(r => r && lqCanSend(r));
  if (rows.length) lqSendRowsReview(rows, lqRoom());
}
function lqSendRowsReview(rows, roomNow, preset) {
  lqPending = rows;
  const i = lqSnd.info;
  if (roomNow == null) roomNow = lqRoom();
  const maxNow = Math.min(rows.length, Math.max(0, roomNow)), maxAll = Math.min(rows.length, Math.max(0, roomNow) + (Number(i.used_today) || 0));
  lqSplit = false; lqCtx = { maxNow, maxAll };
  const brs = lqBranches();
  const inWin = i.dubai_hour >= i.hour_from && i.dubai_hour < i.hour_to;
  const sample = rows[0];
  lqModalOpen(`<h3 id="lqmH">Send ${lcNum(maxNow || maxAll)} message${(maxNow || maxAll) === 1 ? '' : 's'} through respond.io?</h3>
    <div id="lqmSum"></div>
    <p class="slv-note">Example, for ${lcEsc(sample._first)} at ${lcEsc(LC_BRANCH[sample.branch] || sample.branch)}:</p>
    <div class="lq-bubble lqm-ex">${lcEsc(lqSendText(sample))}</div>
    ${i.enabled ? '' : '<p class="ss-plan ss-bad">Sending is OFF, so nothing goes until it is switched on.</p>'}
    ${brs.length > 1 ? `<div class="ss-opt lqm-split"><label><input type="radio" name="lqsSplit" value="all" checked onchange="lqSplitSet(false)"> Same for every branch</label>
      <label><input type="radio" name="lqsSplit" value="each" onchange="lqSplitSet(true)"> Each branch on its own time</label></div>` : ''}
    <div id="lqmWhen">${lqWhenAll()}</div>
    <ul class="lqm-list">
      <li>Each goes from that client's own branch WhatsApp number, as an approved template.</li>
      <li>It sends itself at its time, even with this page closed${i.slot_cap ? `, and never more than ${lcNum(i.slot_cap)} every ${lcNum(i.slot_minutes)} minutes` : ''}, ${lcEsc(lqHour(i.hour_from))} to ${lcEsc(lqHour(i.hour_to))} Dubai time${inWin ? '' : ' (closed right now, so "as soon as" waits until it opens)'}. You can cancel or move any that have not gone yet.</li>
      <li>Each client is tagged in respond.io: <b>${lcEsc(i.campaign_tag)}</b> and <b>lost-msg-smoothing</b>, <b>lost-msg-colour</b> or <b>lost-msg-due</b>.</li>
      <li>A client who has written STOP, is blocked, or is not a respond.io contact is skipped and shown in Sending.</li></ul>
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="lqModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="lqmGo" onclick="lqSendGo()">Queue</button></div>`);
  if (preset === 'at' || maxNow < 1) { const el = document.querySelector('input[name=lqsMode][value=at]'); if (el) el.checked = true; }
  ssUpdate('lqs');
}
// One When form for the whole send, or (Kate, 16 Oct 2026) one per branch so each branch can have its own day, time and pace. The per-branch form
// is the same ssWhenHtml under the prefix lqs_<BRANCH>; Queue then calls lost_send_enqueue once per branch (the database already counts the daily
// cap per day across calls, so no migration is needed).
let lqSplit = false, lqCtx = { maxNow: 0, maxAll: 0 };
const lqBranches = () => ['SAA', 'KCA', 'MC', 'AQ'].filter(b => lqPending.some(r => r.branch === b));
const lqBrRows = b => lqPending.filter(r => r.branch === b);
function lqWhenAll() {
  const i = lqSnd.info;
  return ssWhenHtml('lqs', { max: Math.max(1, lqCtx.maxAll), maxNow: lqCtx.maxNow, from: i.hour_from, to: i.hour_to, nowOk: lqCtx.maxNow > 0, onChange: lqSendSummary });
}
function lqWhenEach() {
  const i = lqSnd.info;
  return `<p class="slv-note">The daily limit is shared, so branches that go today can only send what is left of it between them.</p>` + lqBranches().map(b => {
    const n = lqBrRows(b).length;
    return `<div class="lqm-br"><label class="ss-opt"><input type="checkbox" id="lqsb_${b}" checked onchange="lqEachSummary()"> <b>${lcEsc(LC_BRANCH[b] || b)}</b> <span class="slv-note">${lcNum(n)} client${n === 1 ? '' : 's'}</span></label>
      ${ssWhenHtml('lqs_' + b, { max: n, maxNow: Math.min(n, lqCtx.maxNow), from: i.hour_from, to: i.hour_to, nowOk: lqCtx.maxNow > 0, onChange: lqEachSummary })}</div>`;
  }).join('');
}
function lqSplitSet(on) {
  lqSplit = !!on;
  const w = document.getElementById('lqmWhen'), go = document.getElementById('lqmGo');
  if (!w) return;
  w.innerHTML = on ? lqWhenEach() : lqWhenAll();
  if (on) lqBranches().forEach(b => ssUpdate('lqs_' + b)); else ssUpdate('lqs');
  if (go && !on) go.disabled = false;
}
// What each ticked branch has chosen: [{b, rows, r}]. A branch with no valid choice has r.error.
function lqEachPicks() {
  return lqBranches().filter(b => { const c = document.getElementById('lqsb_' + b); return c && c.checked; }).map(b => {
    const r = ssWhenRead('lqs_' + b);
    return { b, r, rows: r.error ? [] : lqBrRows(b).slice(0, r.limit) };
  });
}
function lqEachSummary() {
  const go = document.getElementById('lqmGo'), picks = lqEachPicks();
  const bad = picks.some(x => x.r.error), n = picks.reduce((a, x) => a + x.rows.length, 0);
  if (go) { go.disabled = bad || !picks.length; go.textContent = `${picks.some(x => x.r.at || x.r.every) ? 'Schedule' : 'Queue'} ${lcNum(n)}`; }
  lqTemplateTable(picks.flatMap(x => x.rows));
  const h = document.getElementById('lqmH'); if (h) h.textContent = `Queue ${lcNum(n)} message${n === 1 ? '' : 's'} through respond.io?`;
}
function lqTemplateTable(list) {
  const sum = document.getElementById('lqmSum'), i = lqSnd.info;
  if (!sum || !i) return;
  const by = {};
  list.forEach(x => { const k = lqTkey(x); by[k] = (by[k] || 0) + 1; });
  sum.innerHTML = `<table class="slv-table lqm-tbl"><tbody>${Object.keys(by).map(k => { const t = i.templates.find(x => x.key === k); return `<tr><td>${lcEsc(t ? t.respond_name : k)}</td><td class="lqm-n">${lcNum(by[k])}</td></tr>`; }).join('')}</tbody></table>`;
}
// Called by the When form on every change: the button and the per-template counts follow how many she chose.
function lqSendSummary(r) {
  const go = document.getElementById('lqmGo'), sum = document.getElementById('lqmSum'), h = document.getElementById('lqmH'), i = lqSnd.info;
  if (go) { go.disabled = !!r.error; if (!r.error) go.textContent = `${r.at || r.every ? 'Schedule' : 'Queue'} ${lcNum(r.count)}`; }
  if (!sum || !i || r.error) return;
  lqTemplateTable(lqPending.slice(0, r.count));
  if (h) h.textContent = `${r.at || r.every ? 'Schedule' : 'Send'} ${lcNum(r.count)} message${r.count === 1 ? '' : 's'} through respond.io?`;
}
const lqItem = x => ({ client_key: x.client_key, phone: x._phone, branch: x.branch, tkey: lqTkey(x), dups: x._dupKeys, vars: lqSendVars(x), wave: typeof lqwSendWave === 'function' ? lqwSendWave(x) : 0 });
async function lqSendGo() {
  const b = document.getElementById('lqmGo');
  // One run per group: everyone together, or one run per ticked branch with its own time and pace.
  let runs;
  if (lqSplit) {
    const picks = lqEachPicks();
    if (!picks.length || picks.some(x => x.r.error)) { lqEachSummary(); return; }
    runs = picks.map(x => ({ name: LC_BRANCH[x.b] || x.b, r: x.r, rows: x.rows }));
  } else {
    const r = ssWhenRead('lqs');
    if (r.error || !lqPending.length) { ssUpdate('lqs'); return; }
    runs = [{ name: '', r, rows: lqPending.slice(0, r.limit) }];
  }
  if (b) { b.disabled = true; b.textContent = 'Queueing…'; }
  const out = [];
  let failed = null;
  for (const run of runs) {
    const { data, error } = await sb.rpc('lost_send_enqueue', { p_items: run.rows.map(lqItem), p_at: run.r.at, p_batch: run.r.batch, p_every: run.r.every });
    if (error) { console.error(error); failed = { run, error }; break; }
    out.push({ run, data });
  }
  lqModalClose();
  lqPending = [];
  const timing = (run, data) => (run.r.at || run.r.every) && data.first_at ? `first ${ssFmt(data.first_at)}${data.last_at && data.last_at !== data.first_at ? `, last ${ssFmt(data.last_at)}` : ''}` : 'now';
  const parts = out.map(({ run, data }) => {
    const sk = (data && data.skipped) || [], why = {};
    sk.forEach(x => { why[x.reason] = (why[x.reason] || 0) + 1; });
    return `${run.name ? run.name + ' ' : ''}${lcNum(data.queued)} (${timing(run, data)})${sk.length ? `, not queued: ${Object.keys(why).map(k => `${why[k]} ${k}`).join(', ')}` : ''}`;
  });
  let msg = parts.length ? `Queued ${parts.join('. ')}. ${runs.some(x => x.r.at || x.r.every) ? 'It sends itself' : ''}`.trim() : '';
  if (failed) {
    const em = failed.error.message || 'try again';
    msg += `${msg ? ' ' : ''}${/switched off/i.test(em) ? 'Sending is switched off.' : `${failed.run.name ? failed.run.name + ' did not queue: ' : 'That did not queue: '}${em}.`}${out.length ? ' The branches above it did queue.' : ''}`;
  }
  await lqSendLoad(); lqRelink(); lqPaint();
  lqNote(msg);
  if (out.some(({ run }) => !run.r.at)) lqKick();
  lqPoll();
}
// Ask the worker to start now instead of waiting for the next minute. Failing to reach it is harmless: the cron picks the queue up.
function lqKick() { try { sb.functions.invoke('lost-send-worker', { body: {} }).then(() => {}, () => {}); } catch (e) {} }
function lqPoll() {
  clearTimeout(lqSnd.poll);
  if (lqSel.tab !== 'queue') return;
  const live = Object.values(lqSnd.jobs).filter(j => j.status === 'queued' || j.status === 'sending');
  if (!live.length) return;
  const due = live.some(j => j.status === 'sending' || !j.next_try_at || Date.parse(j.next_try_at) <= lqNowMs() + 1000);
  lqSnd.poll = setTimeout(async () => {
    const before = Object.values(lqSnd.jobs).filter(j => j.status === 'sent').length;
    await lqSendLoad();
    const after = Object.values(lqSnd.jobs).filter(j => j.status === 'sent').length;
    if (after > before) await lqRenderQueue(true);   // something went: the Sent view has changed too
    else { lqRelink(); if (lqSel.tab === 'queue') lqPaint(); }
    lqPoll();
  }, due ? 15000 : 60000);
}
// The database's clock, so "due" and "scheduled" do not depend on the laptop's.
const lqNowMs = () => Date.now() + (lqSnd.skew || 0);
// A queued message the person gave a time to (scheduled_for) and that is not due yet.
const lqIsSched = j => !!(j && j.status === 'queued' && j.scheduled_for && j.next_try_at && Date.parse(j.next_try_at) > lqNowMs() + 1000);
// The Send at column of the Sending view.
function lqOutAt(r, i) {
  const j = r._job || {};
  if (j.status === 'queued') {
    if (j.scheduled_for) return `<div class="ss-cell"><span><b>${lcEsc(ssFmt(j.next_try_at || j.scheduled_for))}</b></span>${lqIsSched(j) ? '' : '<span class="slv-note">due now</span>'}<button type="button" class="tglr lc-btn" onclick="lqChangeTime(${i})">Change time</button></div>`;
    return j.next_try_at && Date.parse(j.next_try_at) > lqNowMs() + 60000 ? `<span class="slv-note">Retry ${lcEsc(ssFmt(j.next_try_at))}</span>` : '<span class="slv-note">Next minute</span>';
  }
  if (j.status === 'sent' && j.sent_at) return `<span class="slv-note">Sent ${lcEsc(ssFmt(j.sent_at))}</span>`;
  return '<span class="slv-muted">–</span>';
}
// The exact Meta template a failed send was queued with, and the values for its {{1}}, {{2}}, so a send that has to go by hand can pick the same
// template in respond.io (Kate, 19 Oct 2026). The key and the values come from lost_send_jobs_get (migrations/lost_send_jobs_tkey.sql), the name from
// lost_send_info().templates.
function lqFailTpl(j) {
  const t = j && j.tkey && lqSnd.info && (lqSnd.info.templates || []).find(x => x.key === j.tkey);
  if (!t) return '';
  const p = Array.isArray(j.params) ? j.params : [];
  const vals = (t.vars || []).map((k, n) => `{{${n + 1}}} ${lcEsc(p[n] != null ? p[n] : '')}`).join(' · ');
  return `<div class="lq-tpl"><span class="slv-note">Template in respond.io</span> <code>${lcEsc(t.respond_name)}</code> <button type="button" class="tglr lc-btn" onclick="lqCopyTpl('${lcEsc(t.respond_name)}')">Copy name</button>${vals ? `<div class="slv-note">${vals}</div>` : ''}</div>`;
}
async function lqCopyTpl(n) {
  try { await navigator.clipboard.writeText(n); lqNote('Copied ' + n); } catch (e) { lqNote('The browser would not copy. Select the name instead.'); }
}
function lqOutAct(r, i) {
  const j = r._job || {};
  if (j.status === 'queued') return `<div class="lq-q">${j.scheduled_for ? 'Scheduled' : 'Queued'}${j.requested_by ? ` by ${lcEsc(j.requested_by)}` : ''}</div><div class="lq-acts"><button type="button" class="tglr lc-btn" onclick="lqCancel(${i})">Cancel</button></div>`;
  if (j.status === 'sending') return '<div class="lq-q">Sending…</div>';
  if (j.status === 'skipped') return `<div class="lq-skip">Skipped</div><div class="slv-note">${lcEsc(j.error || '')}</div>`;
  const wa = r._ch === 'whatsapp' && r._phone ? `<button type="button" class="tglr lc-btn" onclick="lqOpen(${i})">Open in WhatsApp</button>` : '';
  return `<div class="lq-fail">Did not send</div><div class="slv-note">${lcEsc(j.error || '')}</div>${lqFailTpl(j)}
    <div class="lq-acts"><button type="button" class="tglr lc-btn lq-pri" onclick="lqRetry(${i})">Retry</button>${wa}<button type="button" class="tglr lc-btn" onclick="lqMarkOne(${i})" title="I sent this one">Mark sent</button></div>`;
}

// ── CHANGE THE TIME OF WHAT IS SCHEDULED ───────────────────────────────────────────────────────────────────
// One message, or everything scheduled (kept in its current order), moved to a new time and pace.
let lqChg = null;
function lqChgOpen(ids, one) {
  const i = lqSnd.info;
  if (!i || !ids.length) return;
  lqChg = { ids, one: one || null };
  lqModalOpen(`<h3>Change the time</h3>
    <p class="slv-note">${lcNum(ids.length)} scheduled message${ids.length === 1 ? '' : 's'}${one ? '. Move this one, or all of them to a new time and pace.' : ' move to the new time and pace.'}</p>
    ${ssWhenHtml('lqs', { max: ids.length, maxNow: ids.length, from: i.hour_from, to: i.hour_to, nowOk: true, onChange: r => { const g = document.querySelectorAll('.lqm-btns .lq-pri, .lqm-btns [data-one]'); g.forEach(b => { b.disabled = !!r.error; }); } })}
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="lqModalClose()">Cancel</button>
      ${one ? '<button type="button" class="tglr lc-btn" data-one="1" onclick="lqChgGo(false)">Move this one</button>' : ''}
      <button type="button" class="tglr lc-btn lq-pri" onclick="lqChgGo(true)">${one ? `Move all ${lcNum(ids.length)}` : 'Change time'}</button></div>`);
  const n = document.getElementById('lqsN'); if (n) n.disabled = true;   // it is always all of them
  const at = document.querySelector('input[name=lqsMode][value=at]'); if (at) at.checked = true;   // changing the time: start from the set-time option
  ssUpdate('lqs');
}
function lqSchedIds(rows) {   // ids of the scheduled messages, in the order they are due
  return (rows ? rows.map(r => r._job).filter(Boolean) : Object.values(lqSnd.jobs)).filter(j => j.status === 'queued' && j.scheduled_for)
    .sort((a, b) => Date.parse(a.next_try_at) - Date.parse(b.next_try_at) || a.id - b.id).map(j => j.id);
}
function lqChangeTime(i) {
  const r = lqShown[i];
  if (!r || !r._job) return;
  lqChgOpen(lqSchedIds(), r._job.id);
}
async function lqChgGo(all) {
  const r = ssWhenRead('lqs');
  if (r.error || !lqChg) { ssUpdate('lqs'); return; }
  const ids = all ? lqChg.ids : [lqChg.one];
  const { data, error } = await sb.rpc('lost_send_reschedule', { p_ids: ids, p_at: r.at, p_batch: all ? r.batch : null, p_every: all ? r.every : null });
  lqModalClose();
  if (error) { console.error(error); lqNote('That did not change: ' + (error.message || 'try again') + '.'); return; }
  await lqSendLoad(); lqRelink(); lqPaint();
  lqNote(`Moved ${lcNum(data || 0)}. ${r.at ? `First ${ssFmt(r.first)}${r.last !== r.first ? `, last ${ssFmt(r.last)}` : ''}.` : 'They go as soon as the window allows.'}`);
  if (!r.at) lqKick();
  lqPoll();
}

// ── FAILED-SEND TRIAGE (send-schedule.js draws it; the database sorts each error: send_error_class) ───────────────
const lqFailedJobs = cls => Object.values(lqSnd.jobs).filter(j => j.status === 'failed' && (j.error_class || 'check') === cls);
const lqRowOf = j => lqRows.find(r => r.client_key === j.client_key);
function lqTriageHtml() {
  const rows = Object.values(lqSnd.jobs).filter(j => j.status === 'failed').map(j => ({ id: j.id, cls: j.error_class || 'check', error: j.error }));
  return ssTriageHtml(rows, { retry: 'lqTriRetry', copy: 'lqTriCopy', mark: 'lqTriMark', open: 'lqTriOpen',
    checkTitle: 'Check respond.io first',
    checkSay: 'The connection dropped or respond.io answered with an error while sending, so the message may already have gone. Look in respond.io: mark the ones that went as sent, retry only the ones that did not.',
    stopSay: 'These fail the same way every time (not a respond.io contact yet, a refused or odd number). Open them in WhatsApp and write by hand, then mark them sent.' });
}
function lqTriRetry(cls) {
  const jobs = lqFailedJobs(cls), i = lqSnd.info;
  if (!jobs.length || !i) return;
  lqChg = { retry: true, ids: jobs.map(j => j.id) };
  lqModalOpen(`<h3>Retry ${lcNum(jobs.length)} failed message${jobs.length === 1 ? '' : 's'}?</h3>
    ${cls === 'check' ? '<p class="ss-plan ss-bad">These may already have gone. Retry only if you looked in respond.io and they did not, or the client will get the message twice.</p>'
      : '<p class="slv-note">Nothing went out for these, so queueing them again cannot message anyone twice. A client who is already queued or sent is left out.</p>'}
    ${i.enabled ? '' : '<p class="ss-plan ss-bad">Sending is OFF, so nothing goes until it is switched on.</p>'}
    ${ssWhenHtml('lqs', { max: jobs.length, maxNow: jobs.length, from: i.hour_from, to: i.hour_to, nowOk: true, onChange: r => { const b = document.getElementById('lqtGo'); if (b) b.disabled = !!r.error; } })}
    <div class="lqm-btns"><button type="button" class="tglr lc-btn" onclick="lqModalClose()">Cancel</button>
      <button type="button" class="tglr lc-btn lq-pri" id="lqtGo" onclick="lqTriGo()">Retry</button></div>`);
  ssUpdate('lqs');
}
async function lqTriGo() {
  const r = ssWhenRead('lqs');
  if (r.error || !lqChg || !lqChg.retry) { ssUpdate('lqs'); return; }
  const { data, error } = await sb.rpc('lost_send_retry', { p_ids: lqChg.ids.slice(0, r.limit), p_at: r.at, p_batch: r.batch, p_every: r.every });
  lqModalClose();
  if (error) { console.error(error); lqNote('That did not retry: ' + (error.message || 'try again') + '.'); return; }
  await lqSendLoad(); lqRelink(); lqPaint();
  lqNote(`Retrying ${lcNum(data || 0)}${(data || 0) < Math.min(r.limit, lqChg.ids.length) ? ' (the others are already queued or sent)' : ''}. ${r.at ? `First ${ssFmt(r.first)}.` : ''}`);
  if (!r.at) lqKick();
  lqPoll();
}
function lqTriMark(cls) {
  const rows = lqFailedJobs(cls).map(lqRowOf).filter(r => r && !r.messaged);
  if (!rows.length) return;
  if (!confirm(`Mark ${rows.length} client${rows.length === 1 ? '' : 's'} as sent?\n\nOnly do this if you checked and the message went (or you wrote to them yourself).`)) return;
  lqMark(rows);
}
function lqTriOpen(cls) {
  const r = lqFailedJobs(cls).map(lqRowOf).find(x => x && x._phone);
  if (!r) { lqNote('No number to open.'); return; }
  window.open('https://wa.me/' + r._phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(lqShownText(r)), '_blank', 'noopener');
}
async function lqTriCopy(cls) {
  const nums = [...new Set(lqFailedJobs(cls).map(lqRowOf).map(r => r && r._phone).filter(Boolean))];
  try { await navigator.clipboard.writeText(nums.join('\n')); lqNote(`Copied ${lcNum(nums.length)} numbers`); }
  catch (e) { lqNote('The browser would not copy.'); }
}
async function lqCancel(i) {
  const r = lqShown[i];
  if (!r || !r._job) return;
  const { error } = await sb.rpc('lost_send_cancel', { p_ids: [r._job.id] });
  if (error) { console.error(error); lqNote('That did not cancel. Try again.'); return; }
  await lqSendLoad(); lqRelink(); lqPaint();
}
async function lqRetry(i) {
  const r = lqShown[i];
  if (!r || !r._job) return;
  const { data, error } = await sb.rpc('lost_send_retry', { p_ids: [r._job.id] });
  if (error || !data) { if (error) console.error(error); lqNote('That did not retry. It may already be queued or sent.'); return; }
  await lqSendLoad(); lqRelink(); lqPaint(); lqKick(); lqPoll();
}
async function lqSendToggle() {
  const on = !lqSendOn();
  if (on && !confirm('Switch sending on? Anyone at Level 4 and above can then queue messages to clients.')) return;
  const { data, error } = await sb.rpc('lost_send_config_set', { p_patch: { enabled: on } });
  if (error) { console.error(error); lqNote('That did not change. Level 6 only.'); return; }
  lqSnd.info = data; lqPaint();
}
// A test goes to the number set as lost_send_config.test_phone, through the same worker and template, and is tagged lost-send-test.
async function lqSendTest() {
  const sel = document.getElementById('lqTestTpl'), key = sel && sel.value;
  if (!key) { lqNote('No template is approved yet.'); return; }
  const t = lqSnd.info.templates.find(x => x.key === key);
  lqNote('Sending the test…');
  const { data: id, error } = await sb.rpc('lost_send_test', { p_tkey: key, p_vars: { first_name: 'Kate', branch: 'Saadiyat', stylist: 'Nikki', month: 'August 2026' } });
  if (error) { console.error(error); lqNote(`The test did not queue: ${error.message || 'try again'}`); return; }
  lqKick();
  for (let n = 0; n < 24; n++) {
    await new Promise(r => setTimeout(r, 2500));
    const { data } = await sb.rpc('lost_send_test_get', { p_id: id });
    if (!data) continue;
    if (data.status === 'sent' && (data.tagged || data.tag_err)) { lqNote(`Test ${t.respond_name} sent.${data.tagged ? ' Contact tagged in respond.io.' : ` The tag did not go on: ${data.tag_err}`}`); return; }
    if (data.status === 'failed' || data.status === 'skipped') { lqNote(`Test did not send: ${data.error || data.status}`); return; }
    if (data.status === 'sent' && n > 6) { lqNote(`Test ${t.respond_name} sent. The tag is still going on.`); return; }
  }
  lqNote('The test is still in the queue. It goes on the next run (the worker runs every minute).');
}
